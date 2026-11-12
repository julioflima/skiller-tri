import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { canManageTeam, canSeePatient, managesPatients, testsFor, type SessionUser } from "./auth";
import { readDb } from "./db";
import { formProgress, GUARDIAN_LABEL, respondentName } from "./forms";
import { fail, type Result } from "./result";
import { ROLE_LABEL } from "./roles";
import { band, scoreForms, seriesLabel, SERIES_ORDER } from "./scoring";
import type { Db, Patient, Scale, Stage, Test } from "./types";
import { changeOwnName, updateUser } from "@/app/painel/user-actions";
import { createInvite, renewInvite } from "@/app/painel/invite-actions";
import { createSchool, updateSchool } from "@/app/painel/school-actions";
import {
  createPatient,
  createSession,
  redrawForm,
  regenerateLink,
  savePatientNotes,
  setArchived,
  updatePatient,
  updateSessionNotes,
  type PatientInput,
} from "@/app/painel/patient-actions";
import {
  createTest,
  moveCategory,
  moveQuestion,
  saveCategory,
  saveLanding,
  saveQuestion,
  saveScale,
  saveStage,
  toggleQuestion,
  updateTestMeta,
} from "@/app/painel/test-actions";

// Ferramentas do assistente da plataforma. Cada uma reaproveita a ação da tela correspondente, com as mesmas
// validações e permissões (quem não pode, recebe o mesmo erro da tela). Não existe ferramenta de exclusão:
// as que poderiam apagar algo por omissão (escala, etapa, landing, escola) recusam quando algo sumiria.

type Input = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type ToolContext = { user: SessionUser; origin: string; logGap: (gap: GapInput) => Promise<void> };
export type GapInput = { question: string; kind: string; topic: string; reason: string };
type Tool = Anthropic.Tool & { label: string; write?: boolean };
export type ToolOutcome = { ok: boolean; text: string; label: string; write: boolean };

const str = { type: "string" } as const;
const bool = { type: "boolean" } as const;
const num = { type: "number" } as const;
const ROLE_ENUM = { type: "string", enum: ["paciente", "responsavel", "terapeuta"] } as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

export const GAP_KINDS: Record<string, string> = {
  sem_funcao: "A plataforma não faz isso",
  sem_dados: "Faltam dados",
  conhecimento: "Pergunta de conhecimento",
  permissao: "Sem permissão",
  exclusao: "Pediu para excluir",
  outro: "Outro",
};

export const TOOLS: Tool[] = [
  // ---------- leitura ----------
  { name: "ver_contexto", label: "Consultou a plataforma", description: "Quem é o usuário, a escola dele, as escolas e os testes que ele pode ver, com ids. Chame primeiro quando precisar de ids.", input_schema: obj({}) },
  {
    name: "listar_pacientes",
    label: "Listou pacientes",
    description: "Pacientes que o usuário pode ver, com terapeuta, teste, escola e quantas sessões. Busca por nome (parte do nome serve).",
    input_schema: obj({ busca: str, escolaId: str, incluirArquivados: bool }),
  },
  {
    name: "ver_paciente",
    label: "Abriu um paciente",
    description: "Tudo de um paciente: responsáveis, terapeuta, sessões, formulários (respondidos e pendentes, com ids), resultado por classificação e por quem respondeu, e os links de resposta que o usuário pode ver.",
    input_schema: obj({ id: str }, ["id"]),
  },
  {
    name: "ver_teste",
    label: "Abriu um teste",
    description: "Um teste: classificações, escalas, perguntas e etapas com ids (perguntas e escalas completas só para o dono).",
    input_schema: obj({ id: str }, ["id"]),
  },
  {
    name: "ver_equipe",
    label: "Consultou a equipe",
    description: "Pessoas e convites pendentes de uma escola (sem escolaId: a do usuário; o dono pode ver os donos com escolaId \"donos\").",
    input_schema: obj({ escolaId: str }),
  },
  // ---------- pacientes ----------
  {
    name: "cadastrar_paciente",
    label: "Cadastrou paciente",
    write: true,
    description: "Cadastra um paciente (administrador da escola ou dono). Responsáveis: kind mae ou pai.",
    input_schema: obj(
      {
        name: str,
        birthDate: { type: "string", description: "AAAA-MM-DD" },
        email: str,
        testId: str,
        schoolId: { type: "string", description: "Só o dono escolhe; os demais usam a própria escola." },
        therapistId: str,
        guardians: { type: "array", items: obj({ kind: { type: "string", enum: ["mae", "pai"] }, name: str, email: str, phone: str }, ["kind", "name"]) },
      },
      ["name", "testId"],
    ),
  },
  {
    name: "editar_paciente",
    label: "Editou paciente",
    write: true,
    description:
      "Edita um paciente; omita o que não muda. guardians, quando enviado, é a lista inteira: mantenha os id dos responsáveis que continuam (não é possível tirar responsáveis por aqui).",
    input_schema: obj(
      {
        id: str,
        name: str,
        birthDate: str,
        email: str,
        testId: str,
        schoolId: str,
        therapistId: str,
        guardians: { type: "array", items: obj({ id: str, kind: { type: "string", enum: ["mae", "pai"] }, name: str, email: str, phone: str }, ["kind", "name"]) },
      },
      ["id"],
    ),
  },
  { name: "arquivar_paciente", label: "Arquivou ou reativou paciente", write: true, description: "Arquiva (arquivado true) ou reativa um paciente. Arquivar não apaga nada.", input_schema: obj({ id: str, arquivado: bool }, ["id", "arquivado"]) },
  { name: "salvar_anotacoes_paciente", label: "Salvou anotações do paciente", write: true, description: "Substitui as anotações gerais do paciente (leia as atuais antes e mantenha o que não muda).", input_schema: obj({ id: str, notes: str }, ["id", "notes"]) },
  {
    name: "registrar_sessao",
    label: "Registrou sessão",
    write: true,
    description: "Registra uma nova sessão e cria os formulários dela.",
    input_schema: obj({ patientId: str, date: { type: "string", description: "AAAA-MM-DD; vazio = hoje" }, notes: str }, ["patientId"]),
  },
  { name: "anotar_sessao", label: "Salvou anotações da sessão", write: true, description: "Substitui as anotações de uma sessão.", input_schema: obj({ sessionId: str, notes: str }, ["sessionId", "notes"]) },
  {
    name: "gerar_novo_link",
    label: "Gerou novo link de respostas",
    write: true,
    description: "Gera um novo link de respostas; o anterior para de funcionar. quem = \"paciente\", \"terapeuta\" ou o id do responsável.",
    input_schema: obj({ patientId: str, quem: str }, ["patientId", "quem"]),
  },
  { name: "sortear_de_novo", label: "Sorteou o formulário de novo", write: true, description: "Sorteia de novo as perguntas de um formulário que ainda não tem respostas.", input_schema: obj({ formId: str }, ["formId"]) },
  // ---------- equipe e escolas ----------
  {
    name: "convidar_pessoa",
    label: "Criou convite",
    write: true,
    description: "Cria um link de convite para alguém criar a própria conta. role: terapeuta, gestor (administrador da escola) ou admin (dono, só o dono convida).",
    input_schema: obj({ name: str, email: str, role: { type: "string", enum: ["terapeuta", "gestor", "admin"] }, schoolId: str }, ["role"]),
  },
  { name: "renovar_convite", label: "Renovou convite", write: true, description: "Gera um novo link para um convite pendente (o anterior para de funcionar).", input_schema: obj({ id: str }, ["id"]) },
  {
    name: "editar_pessoa",
    label: "Editou pessoa da equipe",
    write: true,
    description: "Edita nome, e-mail, papel, escola ou se a conta está ativa (desativar não apaga). Omita o que não muda.",
    input_schema: obj({ id: str, name: str, email: str, role: { type: "string", enum: ["terapeuta", "gestor", "admin"] }, schoolId: str, active: bool }, ["id"]),
  },
  { name: "alterar_meu_nome", label: "Alterou o próprio nome", write: true, description: "Altera o nome do próprio usuário.", input_schema: obj({ name: str }, ["name"]) },
  { name: "criar_escola", label: "Criou escola", write: true, description: "Cria uma escola (só o dono).", input_schema: obj({ name: str }, ["name"]) },
  {
    name: "editar_escola",
    label: "Editou escola",
    write: true,
    description: "Edita nome, se está ativa e acrescenta testes aplicados (só o dono). testIds são somados aos atuais; tirar testes de uma escola não é possível por aqui.",
    input_schema: obj({ id: str, name: str, active: bool, testIds: { type: "array", items: str } }, ["id"]),
  },
  // ---------- testes (só o dono) ----------
  {
    name: "criar_teste",
    label: "Criou teste",
    write: true,
    description: "Cria um teste: modo \"vazio\", \"padrao\" (12 habilidades) ou o id de um teste para duplicar.",
    input_schema: obj({ name: str, modo: str }, ["name", "modo"]),
  },
  { name: "editar_dados_teste", label: "Editou dados do teste", write: true, description: "Nome, descrição ou se o teste está ativo. Omita o que não muda.", input_schema: obj({ testId: str, name: str, description: str, active: bool }, ["testId"]) },
  { name: "salvar_classificacao", label: "Salvou classificação", write: true, description: "Cria (sem id) ou edita (com id) uma classificação.", input_schema: obj({ testId: str, id: str, name: str, description: str }, ["testId"]) },
  { name: "mover_classificacao", label: "Reordenou classificação", write: true, description: "Sobe (-1) ou desce (1) uma classificação.", input_schema: obj({ testId: str, id: str, dir: { type: "integer", enum: [-1, 1] } }, ["testId", "id", "dir"]) },
  {
    name: "salvar_pergunta",
    label: "Salvou pergunta",
    write: true,
    description: "Cria (sem id; text, categoryId e scaleId obrigatórios) ou edita (com id; omita o que não muda) uma pergunta.",
    input_schema: obj(
      {
        testId: str,
        id: str,
        text: str,
        categoryId: str,
        scaleId: str,
        targets: { type: "array", items: ROLE_ENUM },
        perspectives: { type: "array", items: { type: "string", enum: ["si", "outro"] } },
        weight: num,
        skillWeights: { type: "object", description: "Peso nas outras classificações, por id; substitui o conjunto inteiro.", additionalProperties: num },
      },
      ["testId"],
    ),
  },
  { name: "ativar_pergunta", label: "Ativou ou desativou pergunta", write: true, description: "Ativa ou desativa uma pergunta (inativas não são sorteadas).", input_schema: obj({ testId: str, id: str, active: bool }, ["testId", "id", "active"]) },
  { name: "mover_pergunta", label: "Reordenou pergunta", write: true, description: "Sobe (-1) ou desce (1) uma pergunta.", input_schema: obj({ testId: str, id: str, dir: { type: "integer", enum: [-1, 1] } }, ["testId", "id", "dir"]) },
  {
    name: "salvar_escala",
    label: "Salvou escala",
    write: true,
    description: "Cria (sem id) ou edita (com id) uma escala. Ao editar, envie todas as opções atuais com os ids (dá para mudar e acrescentar, não tirar).",
    input_schema: obj(
      { testId: str, id: str, name: str, options: { type: "array", items: obj({ id: str, label: str, description: str, weight: num }, ["label", "weight"]) } },
      ["testId", "name", "options"],
    ),
  },
  {
    name: "salvar_etapa",
    label: "Salvou etapa",
    write: true,
    description: "Cria (sem id) ou edita (com id) uma etapa com todas as regras. Ao editar, mantenha todas as regras atuais com os ids (dá para mudar e acrescentar, não tirar).",
    input_schema: obj(
      {
        testId: str,
        id: str,
        name: str,
        kind: { type: "string", enum: ["inicial", "sessao"] },
        rules: {
          type: "array",
          items: obj({ id: str, role: ROLE_ENUM, count: { type: "integer" }, about: { type: "string", enum: ["si", "outro", "paciente"] }, categoryIds: { type: "array", items: str }, instruction: str }, ["role", "count", "about"]),
        },
      },
      ["testId", "name", "kind", "rules"],
    ),
  },
  {
    name: "editar_landing",
    label: "Editou a landing do teste",
    write: true,
    description: "Edita a landing page do teste; omita o que não muda. Imagens só pela tela (botão Enviar).",
    input_schema: obj({ testId: str, slug: str, published: bool, slogan: str, headline: str, lead: str, skillsTitle: str, skillsLead: str, contactUrl: str }, ["testId"]),
  },
  // ---------- lacunas ----------
  {
    name: "registrar_lacuna",
    label: "Anotou no log o que não soube responder",
    description:
      "Anota no log do dono da plataforma algo que você não conseguiu responder ou fazer: função que a plataforma não tem, dado que não existe, pergunta de conhecimento que a plataforma não cobre (ex.: como trabalhar uma habilidade com o paciente), falta de permissão ou pedido de exclusão. Chame sempre que não conseguir atender, antes de responder.",
    input_schema: obj(
      {
        question: { type: "string", description: "O que a pessoa pediu, nas palavras dela." },
        kind: { type: "string", enum: Object.keys(GAP_KINDS) },
        topic: { type: "string", description: "Tema curto (ex.: \"relatório em PDF\", \"empatia\", \"agenda de sessões\")." },
        reason: { type: "string", description: "Por que não deu, em uma frase." },
      },
      ["question", "kind", "topic", "reason"],
    ),
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export const TOOL_DEFINITIONS: Anthropic.Tool[] = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

// ---------- leituras ----------

const json = (v: unknown) => JSON.stringify(v);
const userName = (db: Db, id?: string) => db.users.find((u) => u.id === id)?.name;

function seePatient(db: Db, user: SessionUser, id: string) {
  const p = db.patients.find((x) => x.id === id);
  if (!p || !canSeePatient(user, p)) fail("Paciente não encontrado.");
  return p;
}

function visibleTest(db: Db, user: SessionUser, id: string) {
  const t = testsFor(db, user).find((x) => x.id === id) ?? (user.role !== "admin" ? undefined : db.tests.find((x) => x.id === id));
  if (!t) fail("Teste não encontrado.");
  return t;
}

function context(db: Db, user: SessionUser) {
  const schools = user.role === "admin" ? db.schools : db.schools.filter((s) => s.id === user.schoolId);
  return json({
    usuario: { id: user.id, nome: user.name, email: user.email, papel: ROLE_LABEL[user.role], role: user.role, escolaId: user.schoolId },
    escolas: schools.map((s) => ({ id: s.id, nome: s.name, ativa: s.active, testes: s.testIds.map((id) => db.tests.find((t) => t.id === id)?.name ?? id) })),
    testes: testsFor(db, user).map((t) => ({ id: t.id, nome: t.name, ativo: t.active, perguntas: t.questions.filter((q) => q.active).length, classificacoes: t.categories.length })),
    terapeutas: db.users
      .filter((u) => u.role === "terapeuta" && u.active && (user.role === "admin" || u.schoolId === user.schoolId))
      .map((u) => ({ id: u.id, nome: u.name, escolaId: u.schoolId })),
  });
}

function patients(db: Db, user: SessionUser, input: Input) {
  const q = String(input.busca ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const list = db.patients
    .filter((p) => canSeePatient(user, p))
    .filter((p) => input.incluirArquivados || !p.archived)
    .filter((p) => !input.escolaId || p.schoolId === input.escolaId)
    .filter((p) => !q || p.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q));
  return json({
    total: list.length,
    pacientes: list.slice(0, 80).map((p) => ({
      id: p.id,
      nome: p.name,
      arquivado: !!p.archived,
      terapeuta: userName(db, p.therapistId),
      teste: db.tests.find((t) => t.id === p.testId)?.name,
      escola: db.schools.find((s) => s.id === p.schoolId)?.name,
      sessoes: db.sessions.filter((s) => s.patientId === p.id).length,
    })),
    mostrados: Math.min(list.length, 80),
  });
}

function patientDetail(db: Db, user: SessionUser, origin: string, id: string) {
  const p = seePatient(db, user, id);
  const test = db.tests.find((t) => t.id === p.testId);
  const forms = db.forms.filter((f) => f.patientId === p.id);
  const link = (token: string) => `${origin}/r/${token}`;
  const manager = managesPatients(user);
  const scores = test ? scoreForms(test, forms) : new Map();
  const cats = test ? [...test.categories].sort((a, b) => a.order - b.order) : [];
  return json({
    id: p.id,
    nome: p.name,
    nascimento: p.birthDate,
    email: p.email,
    arquivado: !!p.archived,
    escola: db.schools.find((s) => s.id === p.schoolId)?.name,
    terapeuta: { id: p.therapistId, nome: userName(db, p.therapistId) },
    teste: test ? { id: test.id, nome: test.name } : null,
    responsaveis: p.guardians.map((g) => ({ id: g.id, tipo: GUARDIAN_LABEL[g.kind], nome: g.name, email: g.email, telefone: g.phone, link: manager ? link(g.token) : undefined })),
    links: { paciente: manager ? link(p.token) : undefined, terapeuta: manager || p.therapistId === user.id ? link(p.therapistToken) : undefined },
    anotacoes: p.notes,
    sessoes: db.sessions.filter((s) => s.patientId === p.id).sort((a, b) => a.number - b.number).map((s) => ({ id: s.id, numero: s.number, data: s.date, anotacoes: s.notes })),
    formularios: forms.map((f) => {
      const prog = formProgress(f);
      return { id: f.id, etapa: f.stageName, sessao: f.sessionNumber, quem: respondentName(p, f, userName(db, p.therapistId)), respondidas: prog.done, total: prog.total, concluido: !!f.finishedAt };
    }),
    resultado: [...scores.entries()]
      .sort(([a], [b]) => SERIES_ORDER(a) - SERIES_ORDER(b))
      .map(([key, m]) => ({
        quem: seriesLabel(p, key),
        porClassificacao: cats.filter((c) => m.has(c.id)).map((c) => ({ classificacao: c.name, percentual: Math.round(m.get(c.id)!.pct), faixa: band(m.get(c.id)!.pct).label, respostas: m.get(c.id)!.n })),
      })),
  });
}

function testDetail(db: Db, user: SessionUser, id: string) {
  const t = visibleTest(db, user, id);
  const cats = [...t.categories].sort((a, b) => a.order - b.order);
  const base = {
    id: t.id,
    nome: t.name,
    descricao: t.description,
    ativo: t.active,
    classificacoes: cats.map(({ id, name, description }) => ({ id, name, description, perguntasAtivas: t.questions.filter((q) => q.active && q.categoryId === id).length })),
    etapas: t.stages,
  };
  if (user.role !== "admin") return json(base);
  return json({
    ...base,
    landing: t.landing,
    escalas: t.scales.map((s) => ({ ...s, options: s.options.map(({ id, label, description, weight }) => ({ id, label, description, weight })) })),
    perguntas: [...t.questions].sort((a, b) => a.order - b.order).map(({ id, text, categoryId, scaleId, targets, perspectives, weight, skillWeights, active }) => ({ id, text, categoryId, scaleId, targets, perspectives, weight, skillWeights, active })),
  });
}

function team(db: Db, user: SessionUser, schoolId?: string) {
  const owners = schoolId === "donos";
  const sid = owners ? undefined : (schoolId || user.schoolId);
  if (owners ? user.role !== "admin" : !canManageTeam(user, sid)) fail("Você não pode ver a equipe desta escola.");
  const sameGroup = (x: { role: string; schoolId?: string }) => (owners ? x.role === "admin" : x.role !== "admin" && x.schoolId === sid);
  return json({
    pessoas: db.users.filter(sameGroup).map((u) => ({ id: u.id, nome: u.name, email: u.email, papel: ROLE_LABEL[u.role], role: u.role, ativo: u.active })),
    convitesPendentes: db.invites.filter((i) => !i.acceptedAt && sameGroup(i)).map((i) => ({ id: i.id, nome: i.name, email: i.email, papel: ROLE_LABEL[i.role], expira: i.expiresAt })),
  });
}

// ---------- execução ----------

const done = (r: Result, extra?: string) => ({ ok: r.ok, text: r.ok ? [r.message ?? "ok", extra].filter(Boolean).join(" ") : r.error });

function patientInput(p: Patient | undefined, input: Input): PatientInput {
  const guardians = input.guardians ?? p?.guardians ?? [];
  if (p && input.guardians) {
    const kept = new Set((input.guardians as Input[]).map((g) => g.id).filter(Boolean));
    const lost = p.guardians.filter((g) => !kept.has(g.id));
    if (lost.length) fail(`Não posso tirar responsáveis (${lost.map((g) => g.name).join(", ")}): envie todos os atuais com os ids.`);
  }
  return {
    name: input.name ?? p?.name ?? "",
    birthDate: input.birthDate ?? p?.birthDate,
    email: input.email ?? p?.email,
    testId: input.testId ?? p?.testId ?? "",
    schoolId: input.schoolId ?? p?.schoolId,
    therapistId: input.therapistId ?? p?.therapistId,
    guardians: guardians.map((g: Input) => ({ id: g.id, kind: g.kind, name: g.name, email: g.email, phone: g.phone })),
  };
}

function adminTest(db: Db, user: SessionUser, id: string): Test {
  if (user.role !== "admin") fail("Apenas o dono da plataforma pode editar testes.");
  return visibleTest(db, user, id);
}

async function run(ctx: ToolContext, name: string, input: Input): Promise<{ ok: boolean; text: string }> {
  const { user, origin } = ctx;
  const db = await readDb();
  switch (name) {
    case "ver_contexto":
      return { ok: true, text: context(db, user) };
    case "listar_pacientes":
      return { ok: true, text: patients(db, user, input) };
    case "ver_paciente":
      return { ok: true, text: patientDetail(db, user, origin, input.id) };
    case "ver_teste":
      return { ok: true, text: testDetail(db, user, input.id) };
    case "ver_equipe":
      return { ok: true, text: team(db, user, input.escolaId) };

    case "cadastrar_paciente": {
      const r = await createPatient(patientInput(undefined, input));
      return done(r, r.ok ? `id ${r.data?.id}` : undefined);
    }
    case "editar_paciente":
      return done(await updatePatient(input.id, patientInput(seePatient(db, user, input.id), input)));
    case "arquivar_paciente":
      return done(await setArchived(input.id, !!input.arquivado));
    case "salvar_anotacoes_paciente":
      return done(await savePatientNotes(input.id, String(input.notes ?? "")), "Anotações salvas.");
    case "registrar_sessao":
      return done(await createSession(input.patientId, String(input.date ?? ""), String(input.notes ?? "")));
    case "anotar_sessao":
      return done(await updateSessionNotes(input.sessionId, String(input.notes ?? "")));
    case "gerar_novo_link":
      return done(await regenerateLink(input.patientId, String(input.quem)));
    case "sortear_de_novo":
      return done(await redrawForm(input.formId));

    case "convidar_pessoa": {
      const r = await createInvite({ name: String(input.name ?? ""), email: String(input.email ?? ""), role: input.role, schoolId: input.schoolId || user.schoolId });
      if (!r.ok) return done(r);
      const fresh = await readDb();
      const inv = [...fresh.invites].filter((i) => i.invitedBy === user.id && !i.acceptedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return done(r, inv ? `Link: ${origin}/convite/${inv.token}` : undefined);
    }
    case "renovar_convite": {
      const r = await renewInvite(input.id);
      const inv = r.ok ? (await readDb()).invites.find((i) => i.id === input.id) : undefined;
      return done(r, inv ? `Link: ${origin}/convite/${inv.token}` : undefined);
    }
    case "editar_pessoa": {
      const u = db.users.find((x) => x.id === input.id);
      if (!u) fail("Pessoa não encontrada.");
      return done(
        await updateUser(u.id, {
          name: input.name ?? u.name,
          email: input.email ?? u.email,
          role: input.role ?? u.role,
          schoolId: input.schoolId ?? u.schoolId,
          active: input.active ?? u.active,
        }),
      );
    }
    case "alterar_meu_nome":
      return done(await changeOwnName(String(input.name ?? "")));
    case "criar_escola": {
      const r = await createSchool(String(input.name ?? ""));
      return done(r, r.ok ? `id ${r.data?.id}` : undefined);
    }
    case "editar_escola": {
      const s = db.schools.find((x) => x.id === input.id);
      if (!s) fail("Escola não encontrada.");
      const testIds = [...new Set([...s.testIds, ...((input.testIds as string[]) ?? [])])];
      return done(await updateSchool(s.id, { name: input.name ?? s.name, active: input.active ?? s.active, testIds }));
    }

    case "criar_teste": {
      const r = await createTest(String(input.name ?? ""), String(input.modo ?? "vazio"));
      return done(r, r.ok ? `id ${r.data?.id}` : undefined);
    }
    case "editar_dados_teste": {
      const t = adminTest(db, user, input.testId);
      return done(await updateTestMeta(t.id, input.name ?? t.name, input.description ?? t.description, input.active ?? t.active));
    }
    case "salvar_classificacao": {
      const t = adminTest(db, user, input.testId);
      const cur = input.id ? t.categories.find((c) => c.id === input.id) : undefined;
      if (input.id && !cur) fail("Classificação não encontrada.");
      return done(await saveCategory(t.id, input.id || null, input.name ?? cur?.name ?? "", input.description ?? cur?.description ?? ""));
    }
    case "mover_classificacao":
      return done(await moveCategory(adminTest(db, user, input.testId).id, input.id, input.dir === -1 ? -1 : 1), "Ordem alterada.");
    case "salvar_pergunta": {
      const t = adminTest(db, user, input.testId);
      const cur = input.id ? t.questions.find((q) => q.id === input.id) : undefined;
      if (input.id && !cur) fail("Pergunta não encontrada.");
      return done(
        await saveQuestion(t.id, input.id || null, {
          text: input.text ?? cur?.text ?? "",
          categoryId: input.categoryId ?? cur?.categoryId ?? "",
          scaleId: input.scaleId ?? cur?.scaleId ?? t.scales[0]?.id ?? "",
          targets: input.targets ?? cur?.targets ?? ["paciente"],
          perspectives: input.perspectives ?? cur?.perspectives ?? ["si"],
          weight: input.weight ?? cur?.weight ?? 1,
          skillWeights: input.skillWeights ?? cur?.skillWeights ?? {},
        }),
      );
    }
    case "ativar_pergunta": {
      const t = adminTest(db, user, input.testId);
      const q = t.questions.find((x) => x.id === input.id);
      if (!q) fail("Pergunta não encontrada.");
      if (q.active === !!input.active) return { ok: true, text: "A pergunta já estava assim." };
      return done(await toggleQuestion(t.id, q.id), input.active ? "Pergunta ativada." : "Pergunta desativada.");
    }
    case "mover_pergunta":
      return done(await moveQuestion(adminTest(db, user, input.testId).id, input.id, input.dir === -1 ? -1 : 1), "Ordem alterada.");
    case "salvar_escala": {
      const t = adminTest(db, user, input.testId);
      const options = ((input.options as Input[]) ?? []).map((o) => ({ id: o.id ?? "", label: String(o.label ?? ""), description: String(o.description ?? ""), weight: Number(o.weight) }));
      const cur = input.id ? t.scales.find((s) => s.id === input.id) : undefined;
      if (input.id && !cur) fail("Escala não encontrada.");
      const lost = cur?.options.filter((o) => !options.some((x) => x.id === o.id)) ?? [];
      if (lost.length) fail(`Não posso tirar respostas da escala (${lost.map((o) => o.label).join(", ")}): envie todas as atuais com os ids.`);
      const scale: Scale = { id: input.id ?? "", name: String(input.name ?? ""), options };
      return done(await saveScale(t.id, scale));
    }
    case "salvar_etapa": {
      const t = adminTest(db, user, input.testId);
      const rules = ((input.rules as Input[]) ?? []).map((r) => ({
        id: r.id ?? "",
        role: r.role,
        count: Number(r.count),
        about: r.about,
        categoryIds: r.categoryIds ?? [],
        instruction: String(r.instruction ?? ""),
      }));
      const cur = input.id ? t.stages.find((s) => s.id === input.id) : undefined;
      if (input.id && !cur) fail("Etapa não encontrada.");
      const lost = cur?.rules.filter((r) => !rules.some((x) => x.id === r.id)) ?? [];
      if (lost.length) fail(`Não posso tirar regras da etapa (${lost.length}): envie todas as atuais com os ids.`);
      const stage: Stage = { id: input.id ?? "", name: String(input.name ?? ""), kind: input.kind, rules };
      return done(await saveStage(t.id, stage));
    }
    case "editar_landing": {
      const t = adminTest(db, user, input.testId);
      const cur = t.landing;
      const pick = (k: "slug" | "slogan" | "headline" | "lead" | "skillsTitle" | "skillsLead" | "contactUrl") => String(input[k] ?? cur?.[k] ?? "");
      return done(
        await saveLanding(t.id, {
          slug: pick("slug"),
          published: input.published ?? cur?.published ?? false,
          slogan: pick("slogan"),
          headline: pick("headline"),
          lead: pick("lead"),
          skillsTitle: pick("skillsTitle"),
          skillsLead: pick("skillsLead"),
          contactUrl: pick("contactUrl"),
          // imagens ficam como estão: trocar ou tirar só pela tela
          logoUrl: cur?.logoUrl ?? "",
          heroImageUrl: cur?.heroImageUrl ?? "",
        }),
      );
    }

    case "registrar_lacuna":
      await ctx.logGap({ question: String(input.question ?? ""), kind: GAP_KINDS[input.kind] ? input.kind : "outro", topic: String(input.topic ?? ""), reason: String(input.reason ?? "") });
      return { ok: true, text: "Anotado no log do dono da plataforma." };
    default:
      return { ok: false, text: `Ferramenta desconhecida: ${name}` };
  }
}

export async function runTool(ctx: ToolContext, name: string, input: Input): Promise<ToolOutcome> {
  const tool = TOOL_BY_NAME.get(name);
  try {
    const r = await run(ctx, name, input ?? {});
    return { ...r, label: tool?.label ?? name, write: !!tool?.write };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "Erro inesperado.", label: tool?.label ?? name, write: !!tool?.write };
  }
}

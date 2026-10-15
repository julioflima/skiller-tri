"use server";

import { requireUser } from "@/lib/auth";
import { buildDefaultTest, newId, readDb, updateDb } from "@/lib/db";
import { FILES_ROUTE, deleteLandingImage, landingFolder, saveLandingImage } from "@/lib/landing-files";
import { verifyPassword } from "@/lib/password";
import { fail, guard } from "@/lib/result";
import { DEFAULT_SYMBOL_PROMPT, aiConfig, aiErrorMessage, cleanSvg, generateScaleSymbolsWithAI, symbolPromptFor } from "@/lib/symbols";
import type { About, Db, RespondentRole, Scale, Stage, Test, TestLanding } from "@/lib/types";

const ROLES: RespondentRole[] = ["paciente", "responsavel", "terapeuta"];
const ABOUTS: About[] = ["si", "outro", "paciente"];

function getTest(db: Db, id: string) {
  const t = db.tests.find((x) => x.id === id && !x.deletedAt);
  if (!t) fail("Teste não encontrado.");
  return t;
}

function usedQuestionIds(db: Db, testId: string) {
  const ids = new Set<string>();
  for (const f of db.forms) if (f.testId === testId) f.items.forEach((it) => ids.add(it.questionId));
  return ids;
}

function reorder<T extends { order: number }>(list: T[]) {
  list.sort((a, b) => a.order - b.order).forEach((x, i) => (x.order = i + 1));
}

function move<T extends { id: string; order: number }>(list: T[], id: string, dir: -1 | 1) {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  sorted.forEach((x, k) => (x.order = k + 1));
}

const admin = () => requireUser({ admin: true });
/** Símbolos são SVGs simples: o Sonnet em esforço baixo resolve bem pela metade do preço do Opus. */
const SYMBOL_MODEL = "claude-sonnet-5-5";

// ---------- testes ----------

export async function createTest(name: string, mode: "vazio" | "padrao" | string) {
  return guard<{ id: string }>(async () => {
    await admin();
    if (!name.trim()) fail("Dê um nome ao teste.");
    const id = await updateDb((db) => {
      let test: Test;
      if (mode === "padrao") test = buildDefaultTest();
      else if (mode === "vazio") {
        test = {
          id: newId(),
          name: "",
          description: "",
          active: true,
          createdAt: "",
          scales: [
            {
              id: newId(),
              name: "Concordância (0–4)",
              options: ["Nunca", "Raramente", "Às vezes", "Frequentemente", "Sempre"].map((label, i) => ({ id: newId(), label, description: "", weight: i })),
            },
          ],
          categories: [],
          questions: [],
          stages: [],
        };
      } else {
        // duplica um teste existente com ids novos
        const src = getTest(db, mode);
        const map = new Map<string, string>();
        const nid = (old: string) => map.get(old) ?? (map.set(old, newId()), map.get(old)!);
        test = {
          ...structuredClone(src),
          id: newId(),
          landing: undefined,
          scales: src.scales.map((s) => ({ ...s, id: nid(s.id), options: s.options.map((o) => ({ ...o, id: newId() })) })),
          categories: src.categories.map((c) => ({ ...c, id: nid(c.id) })),
          questions: src.questions.map((q) => ({
            ...q,
            id: newId(),
            categoryId: nid(q.categoryId),
            scaleId: nid(q.scaleId),
            skillWeights: q.skillWeights && Object.fromEntries(Object.entries(q.skillWeights).map(([c, w]) => [nid(c), w])),
          })),
          stages: src.stages.map((s) => ({
            ...s,
            id: newId(),
            rules: s.rules.map((r) => ({ ...r, id: newId(), categoryIds: r.categoryIds.map(nid) })),
          })),
        };
      }
      test.name = name.trim();
      test.createdAt = new Date().toISOString();
      db.tests.push(test);
      return test.id;
    });
    return { message: "Teste criado.", data: { id } };
  });
}

export async function updateTestMeta(id: string, name: string, description: string, active: boolean, symbolPrompt: string) {
  return guard(async () => {
    await admin();
    if (!name.trim()) fail("O nome não pode ficar vazio.");
    await updateDb((db) => {
      const t = getTest(db, id);
      t.name = name.trim();
      t.description = description.trim();
      t.active = active;
      // igual ao padrão = não fixa, para acompanhar melhorias futuras do texto padrão
      const prompt = symbolPrompt.trim();
      if (prompt && prompt !== DEFAULT_SYMBOL_PROMPT) t.symbolPrompt = prompt;
      else delete t.symbolPrompt;
    });
    return "Teste salvo.";
  });
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** Imagem da landing: enviada para a pasta do teste no Blob, ou um arquivo antigo de /public/brand. */
const imageOk = (testId: string, url: string) => url.startsWith(`${FILES_ROUTE}${landingFolder(testId)}`) || /^\/brand\/[\w.-]+$/.test(url);

/** Envia o logo ou a imagem de destaque da landing; o endereço só fica salvo quando a landing é salva. */
export async function uploadLandingImage(testId: string, kind: "logo" | "destaque", form: FormData) {
  return guard<{ url: string }>(async () => {
    await admin();
    const db = await readDb();
    getTest(db, testId);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) fail("Escolha uma imagem.");
    return { message: "Imagem enviada. Salve a landing para usá-la.", data: { url: await saveLandingImage(testId, kind, file) } };
  });
}

export async function saveLanding(id: string, input: TestLanding) {
  return guard(async () => {
    await admin();
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG.test(slug)) fail("O endereço usa só letras minúsculas, números e hífen (até 40).");
    const text = (v: string) => (v ?? "").trim();
    for (const url of [input.logoUrl, input.heroImageUrl].map(text)) if (url && !imageOk(id, url)) fail("Imagem inválida: envie a imagem pelo botão Enviar.");
    // link do WhatsApp; espaços da mensagem viram %20 para o link funcionar
    const contactUrl = text(input.contactUrl).replace(/ /g, "%20");
    if (contactUrl && !/^https:\/\/wa\.me\/\d{10,15}(\?text=\S*)?$/.test(contactUrl)) fail("Use o formato https://wa.me/<número>?text=<mensagem>, com o número só em dígitos (DDI + DDD).");
    if (input.published && !text(input.headline)) fail("Escreva o título antes de publicar.");
    const replaced = await updateDb((db) => {
      const t = getTest(db, id);
      if (db.tests.some((x) => x.id !== id && x.landing?.slug === slug)) fail("Outro teste já usa este endereço.");
      const before = [t.landing?.logoUrl, t.landing?.heroImageUrl];
      t.landing = {
        slug,
        published: input.published,
        slogan: text(input.slogan),
        headline: text(input.headline),
        lead: text(input.lead),
        skillsTitle: text(input.skillsTitle),
        skillsLead: text(input.skillsLead),
        logoUrl: text(input.logoUrl),
        heroImageUrl: text(input.heroImageUrl),
        contactUrl,
      };
      const now = [t.landing.logoUrl, t.landing.heroImageUrl];
      return before.filter((u) => u && !now.includes(u));
    });
    // imagens trocadas ou removidas saem da pasta do teste no Blob
    await Promise.all(replaced.map(deleteLandingImage));
    return input.published ? "Landing publicada." : "Landing salva (não publicada).";
  });
}

/**
 * Exclui o teste: sai do painel, das escolas e da landing, e os pacientes que o usavam são arquivados.
 * O teste continua guardado (aba Arquivo) para o histórico desses pacientes e para poder ser restaurado.
 * É a segunda confirmação da tela: só passa com a senha.
 */
export async function deleteTest(id: string, password: string) {
  return guard(async () => {
    const me = await admin();
    const db = await readDb();
    const u = db.users.find((x) => x.id === me.id);
    if (!password || !u || !(await verifyPassword(password, u.passwordHash))) fail("Senha incorreta.");
    await updateDb((db) => {
      const t = getTest(db, id);
      const patients = db.patients.filter((p) => p.testId === id && !p.archived);
      const schools = db.schools.filter((s) => s.testIds.includes(id));
      patients.forEach((p) => (p.archived = true));
      schools.forEach((s) => (s.testIds = s.testIds.filter((x) => x !== id)));
      t.deletedFrom = {
        schoolIds: schools.map((s) => s.id),
        patientIds: patients.map((p) => p.id),
        // fora de t.landing, o endereço fica livre para outro teste
        ...(t.landing ? { landing: { ...t.landing, published: false } } : {}),
      };
      delete t.landing;
      t.active = false;
      t.deletedAt = new Date().toISOString();
    });
    return "Teste arquivado. Ele fica na aba Arquivo da lista de testes.";
  });
}

/** Desfaz a exclusão: o teste volta inativo, às escolas e com os pacientes que a exclusão tinha arquivado. */
export async function restoreTest(id: string) {
  return guard(async () => {
    await admin();
    const notes = await updateDb((db) => {
      const t = db.tests.find((x) => x.id === id && x.deletedAt);
      if (!t) fail("Teste excluído não encontrado.");
      const from = t.deletedFrom ?? { schoolIds: [], patientIds: [] };
      const notes: string[] = [];
      for (const s of db.schools) if (from.schoolIds.includes(s.id) && !s.testIds.includes(id)) s.testIds.push(id);
      for (const p of db.patients) if (from.patientIds.includes(p.id) && p.testId === id) p.archived = false;
      if (from.landing) {
        if (db.tests.some((x) => x.id !== id && x.landing?.slug === from.landing!.slug)) notes.push("O endereço da landing passou a ser de outro teste: escolha outro.");
        else t.landing = from.landing;
      }
      delete t.deletedAt;
      delete t.deletedFrom;
      return notes;
    });
    return ["Teste restaurado, inativo: ative-o em Dados do teste.", ...notes].join(" ");
  });
}

// ---------- classificações ----------

export async function saveCategory(testId: string, id: string | null, name: string, description: string) {
  return guard(async () => {
    await admin();
    if (!name.trim()) fail("Informe o nome da classificação.");
    await updateDb((db) => {
      const t = getTest(db, testId);
      if (id) {
        const c = t.categories.find((x) => x.id === id);
        if (!c) fail("Classificação não encontrada.");
        c.name = name.trim();
        c.description = description.trim();
      } else {
        t.categories.push({ id: newId(), name: name.trim(), description: description.trim(), order: t.categories.length + 1 });
      }
    });
    return "Classificação salva.";
  });
}

export async function moveCategory(testId: string, id: string, dir: -1 | 1) {
  return guard(async () => {
    await admin();
    await updateDb((db) => move(getTest(db, testId).categories, id, dir));
  });
}

export async function deleteCategory(testId: string, id: string) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const t = getTest(db, testId);
      if (t.questions.some((q) => q.categoryId === id)) fail("Mova ou exclua as perguntas desta classificação antes.");
      t.categories = t.categories.filter((c) => c.id !== id);
      t.questions.forEach((q) => q.skillWeights && delete q.skillWeights[id]);
      t.stages.forEach((s) => s.rules.forEach((r) => (r.categoryIds = r.categoryIds.filter((c) => c !== id))));
      reorder(t.categories);
    });
    return "Classificação excluída.";
  });
}

// ---------- escalas de resposta ----------

export async function saveScale(testId: string, scale: Scale) {
  return guard(async () => {
    await admin();
    if (!scale.name.trim()) fail("Dê um nome à escala.");
    if (scale.options.length < 2) fail("A escala precisa de pelo menos duas respostas.");
    for (const o of scale.options) {
      if (!o.label.trim()) fail("Toda resposta precisa de um texto.");
      if (!Number.isFinite(o.weight)) fail(`Peso inválido em "${o.label}".`);
    }
    await updateDb((db) => {
      const t = getTest(db, testId);
      // o símbolo não vem do formulário da escala: mantém o que já estava salvo em cada resposta
      const prev = new Map(t.scales.find((x) => x.id === scale.id)?.options.map((o) => [o.id, o]));
      const clean: Scale = {
        id: scale.id || newId(),
        name: scale.name.trim(),
        options: scale.options.map((o) => {
          const old = prev.get(o.id);
          return {
            id: o.id || newId(),
            label: o.label.trim(),
            description: o.description.trim(),
            weight: Number(o.weight),
            ...(old?.symbolSvg ? { symbolSvg: old.symbolSvg, symbolSource: old.symbolSource } : {}),
          };
        }),
      };
      const i = t.scales.findIndex((s) => s.id === clean.id);
      if (i >= 0) t.scales[i] = clean;
      else t.scales.push(clean);
    });
    return "Escala salva.";
  });
}

export async function deleteScale(testId: string, id: string) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const t = getTest(db, testId);
      if (t.questions.some((q) => q.scaleId === id)) fail("Há perguntas usando esta escala.");
      t.scales = t.scales.filter((s) => s.id !== id);
    });
    return "Escala excluída.";
  });
}

// ---------- perguntas ----------

export type QuestionInput = {
  text: string;
  categoryId: string;
  scaleId: string;
  targets: RespondentRole[];
  perspectives: ("si" | "outro")[];
  weight: number;
  /** Peso nas outras classificações (habilidades); 0 ou ausente = não conta. */
  skillWeights?: Record<string, number>;
};

function validQuestion(t: Test, q: QuestionInput) {
  if (!q.text?.trim()) fail("Escreva a pergunta.");
  if (!t.categories.some((c) => c.id === q.categoryId)) fail("Escolha a classificação.");
  if (!t.scales.some((s) => s.id === q.scaleId)) fail("Escolha a escala de respostas.");
  const targets = q.targets.filter((r) => ROLES.includes(r));
  if (!targets.length) fail("Marque para quem a pergunta será feita.");
  const weight = Number(q.weight);
  if (!Number.isFinite(weight) || weight <= 0) fail("O peso da pergunta deve ser maior que zero.");
  const perspectives = q.perspectives.filter((p) => p === "si" || p === "outro");
  if (targets.includes("paciente") && !perspectives.length) fail("Marque se o paciente responde sobre si, sobre o outro ou ambos.");
  const skillWeights: Record<string, number> = {};
  for (const [id, raw] of Object.entries(q.skillWeights ?? {})) {
    const w = Number(raw);
    if (!Number.isFinite(w) || w < 0) fail("Os pesos nas habilidades não podem ser negativos.");
    if (w > 0 && id !== q.categoryId && t.categories.some((c) => c.id === id)) skillWeights[id] = w;
  }
  return { text: q.text.trim(), categoryId: q.categoryId, scaleId: q.scaleId, targets, perspectives, weight, skillWeights };
}

export async function saveQuestion(testId: string, id: string | null, input: QuestionInput) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const t = getTest(db, testId);
      const data = validQuestion(t, input);
      if (id) {
        const q = t.questions.find((x) => x.id === id);
        if (!q) fail("Pergunta não encontrada.");
        if (q.categoryId !== data.categoryId) q.order = t.questions.filter((x) => x.categoryId === data.categoryId).length + 1;
        Object.assign(q, data);
      } else {
        const order = t.questions.filter((x) => x.categoryId === data.categoryId).length + 1;
        t.questions.push({ id: newId(), ...data, active: true, order });
      }
    });
    return id ? "Pergunta salva." : "Pergunta adicionada.";
  });
}

export async function toggleQuestion(testId: string, id: string) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const q = getTest(db, testId).questions.find((x) => x.id === id);
      if (q) q.active = !q.active;
    });
  });
}

export async function moveQuestion(testId: string, id: string, dir: -1 | 1) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const t = getTest(db, testId);
      const q = t.questions.find((x) => x.id === id);
      if (q) move(t.questions.filter((x) => x.categoryId === q.categoryId), id, dir);
    });
  });
}

export async function deleteQuestion(testId: string, id: string) {
  return guard(async () => {
    await admin();
    return updateDb((db) => {
      const t = getTest(db, testId);
      const q = t.questions.find((x) => x.id === id);
      if (!q) return;
      if (usedQuestionIds(db, testId).has(id)) {
        q.active = false;
        return "Esta pergunta já foi usada em formulários, então foi desativada em vez de excluída.";
      }
      t.questions = t.questions.filter((x) => x.id !== id);
      return "Pergunta excluída.";
    });
  });
}

// ---------- etapas ----------

export async function saveStage(testId: string, stage: Stage) {
  return guard(async () => {
    await admin();
    if (!stage.name.trim()) fail("Dê um nome à etapa.");
    if (stage.kind !== "inicial" && stage.kind !== "sessao") fail("Tipo de etapa inválido.");
    await updateDb((db) => {
      const t = getTest(db, testId);
      const rules = stage.rules.map((r) => {
        if (!ROLES.includes(r.role)) fail("Papel inválido em uma regra.");
        if (!ABOUTS.includes(r.about)) fail("Perspectiva inválida em uma regra.");
        const count = Math.floor(Number(r.count));
        if (!(count > 0)) fail("A quantidade de perguntas deve ser maior que zero.");
        if (r.role !== "paciente" && r.about !== "paciente") fail("Responsáveis e terapeuta respondem sobre o paciente.");
        if (r.role === "paciente" && r.about === "paciente") fail("O paciente responde sobre si ou sobre o outro.");
        return {
          id: r.id || newId(),
          role: r.role,
          count,
          about: r.about,
          categoryIds: r.categoryIds.filter((c) => t.categories.some((x) => x.id === c)),
          instruction: r.instruction.trim(),
        };
      });
      const clean: Stage = { id: stage.id || newId(), name: stage.name.trim(), kind: stage.kind, rules };
      const i = t.stages.findIndex((s) => s.id === clean.id);
      if (i >= 0) t.stages[i] = clean;
      else t.stages.push(clean);
    });
    return "Etapa salva.";
  });
}

export async function deleteStage(testId: string, id: string) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const t = getTest(db, testId);
      t.stages = t.stages.filter((s) => s.id !== id);
    });
    return "Etapa excluída. Formulários já criados continuam valendo.";
  });
}

// ---------- símbolos ----------

function getOption(db: Db, testId: string, scaleId: string, optionId: string) {
  const o = getTest(db, testId).scales.find((x) => x.id === scaleId)?.options.find((x) => x.id === optionId);
  if (!o) fail("Resposta não encontrada.");
  return o;
}

/** Gera com IA os símbolos de todas as respostas da escala. Só grava o símbolo; texto, peso e id não mudam. */
export async function generateScaleSymbols(testId: string, scaleId: string) {
  return guard(async () => {
    await admin();
    const db = await readDb();
    const t = getTest(db, testId);
    const scale = t.scales.find((x) => x.id === scaleId);
    if (!scale) fail("Escala não encontrada.");
    const { apiKey, workspaceId } = aiConfig();
    if (!apiKey) fail("Defina ANTHROPIC_API_KEY no servidor.");
    let svgs: string[];
    try {
      svgs = await generateScaleSymbolsWithAI({ apiKey, workspaceId, model: SYMBOL_MODEL, instructions: symbolPromptFor(t), scaleName: scale.name, options: scale.options });
    } catch (e) {
      fail(aiErrorMessage(e));
    }
    const ids = scale.options.map((o) => o.id);
    await updateDb((db) => {
      ids.forEach((id, i) => {
        const o = getOption(db, testId, scaleId, id);
        o.symbolSvg = svgs[i];
        o.symbolSource = "ia";
      });
    });
    return "Símbolos gerados.";
  });
}

export async function setManualSymbol(testId: string, scaleId: string, optionId: string, rawSvg: string) {
  return guard(async () => {
    await admin();
    const svg = cleanSvg(rawSvg);
    await updateDb((db) => {
      const o = getOption(db, testId, scaleId, optionId);
      o.symbolSvg = svg;
      o.symbolSource = "manual";
    });
    return "Símbolo salvo.";
  });
}

export async function resetSymbol(testId: string, scaleId: string, optionId: string) {
  return guard(async () => {
    await admin();
    await updateDb((db) => {
      const o = getOption(db, testId, scaleId, optionId);
      delete o.symbolSvg;
      delete o.symbolSource;
    });
    return "Símbolo automático restaurado.";
  });
}

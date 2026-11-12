import "server-only";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { SystemMessage } from "@langchain/core/messages";
import { canSeePatient, testsFor, type SessionUser } from "../auth";
import { readDb } from "../db";
import { prisma } from "../prisma";
import { ROLE_LABEL } from "../roles";
import type { Db } from "../types";
import { seesGaps } from "./access";
import { platformKnowledge } from "./knowledge";

// Contexto de cada pessoa ao usar a IA, montado com LangChain: um ChatPromptTemplate recebe a base de conhecimento filtrada
// pelo que a pessoa pode saber, o perfil dela (papel, escola), a carteira atual (pacientes, pendências) e a memória que a
// skill de memória guardou das conversas anteriores. Sai como a mensagem de sistema do agente, com cache.

const SYSTEM = ChatPromptTemplate.fromTemplate(`Você é a assistente do Skiller, dentro da plataforma. Faz pela pessoa tudo o que a plataforma faz,
usando as ferramentas, e responde qualquer dúvida sobre a plataforma com a base de conhecimento abaixo.

<base_de_conhecimento>
{conhecimento}
</base_de_conhecimento>

<pessoa>
{perfil}
</pessoa>

<carteira_agora>
{carteira}
</carteira_agora>

<memoria_da_pessoa>
{memoria}
</memoria_da_pessoa>

Regras:
- Fale em português do Brasil, curto e direto, no tom da plataforma. Markdown simples (listas, **negrito**), sem tabelas.
- Explique a plataforma (ideia, telas, onde fica cada coisa, como funcionam testes, sorteio, resultados e métodos) com a base de
  conhecimento; diga em qual tela e aba a pessoa faz algo quando ela quiser fazer sozinha.
- Só fale do que o papel da pessoa permite ver. Nunca revele dados de outra escola nem de pacientes que ela não acompanha.
- Você NUNCA exclui, apaga ou remove nada: não existe ferramenta para isso. Se pedirem, diga que exclusões são feitas na própria
  tela da plataforma e indique onde. Arquivar paciente e desativar pessoa ou pergunta não apagam nada e são permitidos.
- Não invente dados nem ids: busque com as ferramentas (ver_contexto dá escolas, testes e terapeutas). Se uma busca trouxer vários
  candidatos, pergunte qual.
- Antes de criar ou alterar, confira os dados. Se faltar algo obrigatório, pergunte. Se o pedido já veio claro e completo, faça direto;
  se for grande ou ambíguo, mostre um resumo e peça confirmação.
- Senhas não passam por você: troca de senha é em Configurações; pessoas novas entram por convite (convidar_pessoa devolve o link).
  Imagens (logo, destaque, símbolos das respostas) só pela tela.
- Quando não puder responder ou fazer algo, diga com clareza que não consegue e, se houver, o caminho na plataforma. Resultados são
  triagem, não diagnóstico: pode orientar de forma geral, deixando claro que não substitui a análise do profissional.
- Use a memória para personalizar (o que a pessoa costuma pedir, como prefere), sem citá-la.
- Datas para a pessoa em dd/mm/aaaa; nas ferramentas, AAAA-MM-DD.

Hoje é {hoje}.`);

function profile(db: Db, user: SessionUser) {
  const school = db.schools.find((s) => s.id === user.schoolId);
  return [
    `Nome: ${user.name}`,
    `Papel: ${ROLE_LABEL[user.role]} (${user.role})`,
    school ? `Escola: ${school.name} (${school.active ? "ativa" : "inativa"})` : user.role === "admin" ? "Sem escola: dono da plataforma" : "Sem escola",
  ].join("\n");
}

/** Retrato curto do que a pessoa tem nas mãos agora, para a IA já saber de onde partir. */
function portfolio(db: Db, user: SessionUser) {
  const patients = db.patients.filter((p) => !p.archived && canSeePatient(user, p));
  const pending = db.forms.filter((f) => !f.finishedAt && patients.some((p) => p.id === f.patientId));
  const lines = [`Pacientes ativos visíveis: ${patients.length}`, `Formulários aguardando resposta: ${pending.length}`];
  if (user.role === "terapeuta") {
    const mine = pending.filter((f) => f.respondent.role === "terapeuta").length;
    lines.push(`Formulários de terapeuta que a própria pessoa precisa responder: ${mine}`);
  }
  if (user.role === "gestor") {
    const team = db.users.filter((u) => u.schoolId === user.schoolId && u.role !== "admin");
    lines.push(`Equipe: ${team.filter((u) => u.role === "terapeuta" && u.active).length} terapeuta(s) ativo(s), ${team.filter((u) => u.role === "gestor").length} administrador(es)`);
  }
  if (user.role === "admin") lines.push(`Escolas: ${db.schools.length} (${db.schools.filter((s) => s.active).length} ativas)`);
  lines.push(`Testes disponíveis: ${testsFor(db, user).map((t) => t.name).join(", ") || "nenhum"}`);
  return lines.join("\n");
}

export async function userMemory(userId: string) {
  return (await prisma.assistantMemory.findUnique({ where: { userId } }))?.summary ?? "";
}

/** Mensagem de sistema com o contexto desta pessoa. */
export async function userContext(user: SessionUser) {
  const db = await readDb();
  const text = await SYSTEM.format({
    conhecimento: platformKnowledge({ role: user.role, seesGaps: seesGaps(user) }),
    perfil: profile(db, user),
    carteira: portfolio(db, user),
    memoria: (await userMemory(user.id)) || "Ainda não há memória: é uma das primeiras conversas desta pessoa.",
    hoje: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
  return {
    school: db.schools.find((s) => s.id === user.schoolId),
    system: new SystemMessage({ content: [{ type: "text", text, cache_control: { type: "ephemeral" } }] }),
  };
}

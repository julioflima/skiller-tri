"use server";

import Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, type SessionUser } from "@/lib/auth";
import { aiConfig, aiErrorMessage } from "@/lib/ai";
import { TOOL_BY_NAME, TOOL_DEFINITIONS, runTool, type GapInput } from "@/lib/assistant-tools";
import { newId, readDb } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { fail, guard } from "@/lib/result";
import { ROLE_LABEL } from "@/lib/roles";
import type { Prisma } from "@/lib/generated/prisma/client";

// Assistente da plataforma: cada pessoa conversa com o Claude, que faz por ela o que as telas fazem (menos excluir)
// e anota no log de lacunas (/painel/lacunas) tudo o que não conseguiu responder ou fazer.

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;

export type AssistantAction = { label: string; ok: boolean; write: boolean };
export type AssistantTurn = { role: "user" | "assistant"; text: string; actions: AssistantAction[] };
export type ConversationSummary = { id: string; title: string; updatedAt: string };
export type ConversationView = ConversationSummary & { turns: AssistantTurn[] };

/** Sonnet: bom com ferramentas e bem mais barato que o Opus (o mesmo do assistente dos testes). */
const MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 16;
/** Mensagens do histórico que vão para o modelo a cada pedido. */
const HISTORY = 60;
const MAX_TEXT = 4000;
const OLD_RESULT = 1500;

function system(user: SessionUser, schoolName?: string) {
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `Você é a assistente do Skiller, plataforma em que escolas acompanham pacientes (adolescentes) por meio de testes.
Você faz pelo usuário tudo o que a plataforma faz, usando as ferramentas: consultar e cadastrar pacientes, responsáveis, sessões,
anotações, links de resposta e resultados; convidar e editar a equipe; e, para o dono, escolas, testes (perguntas, classificações,
escalas, etapas e landing page). As ferramentas respeitam as permissões do papel do usuário: o erro que voltar é o mesmo da tela.

Como a plataforma funciona:
- Papéis: dono (plataforma inteira), administrador da escola (pacientes, links e equipe da escola) e terapeuta (só os próprios pacientes:
  sessões, anotações, resultados e o próprio link de respostas).
- Cada paciente tem um terapeuta, um teste e responsáveis (mãe/pai). Paciente, cada responsável e o terapeuta respondem por links
  próprios (/r/...), sem senha. Gerar um novo link desativa o anterior.
- O teste tem classificações (habilidades), escalas de resposta com pesos, perguntas e etapas: "Início do tratamento" (uma vez) e
  "Sessão" (a cada sessão registrada). As perguntas de cada formulário são sorteadas.
- Resultado: percentual ponderado de 0 a 100 por classificação e por quem respondeu. Faixas: abaixo de 25 não demonstrado,
  25–50 desenvolvimento inicial, 50–75 em desenvolvimento, 75+ consolidada. É triagem, não diagnóstico.

Regras:
- Fale em português do Brasil, curto e direto. Markdown simples (listas, **negrito**), sem tabelas.
- Você NUNCA exclui, apaga ou remove nada: não existe ferramenta para isso. Se pedirem, diga que exclusões são feitas na própria tela
  da plataforma, e chame registrar_lacuna com kind "exclusao". Arquivar paciente e desativar pessoa ou pergunta não apagam nada e são permitidos.
- Não invente dados nem ids: busque com as ferramentas (ver_contexto dá escolas, testes e terapeutas). Se uma busca trouxer vários
  candidatos, pergunte qual.
- Antes de criar ou alterar, confira os dados. Se faltar algo obrigatório, pergunte. Se o pedido já veio claro e completo, faça direto;
  se for grande ou ambíguo, mostre um resumo e peça confirmação.
- Senhas não passam por você: troca de senha é em Configurações; pessoas novas entram por convite (convidar_pessoa devolve o link).
- Imagens (logo, destaque, símbolos das respostas) só pela tela.
- LOG DE LACUNAS: sempre que não conseguir responder ou fazer algo — a plataforma não tem a função, o dado não existe, falta
  permissão, ou é uma pergunta de conhecimento que a plataforma não cobre (ex.: como trabalhar uma habilidade com o paciente,
  o que significa um resultado além das faixas) — chame registrar_lacuna ANTES de responder, com o pedido nas palavras da pessoa.
  Depois diga que anotou para a equipe do Skiller. Para perguntas de conhecimento, você pode dar uma orientação geral curta,
  deixando claro que não é conteúdo da plataforma, e ainda assim registrar a lacuna.
- Datas para o usuário em dd/mm/aaaa; nas ferramentas, AAAA-MM-DD.

Usuário: ${user.name} (${ROLE_LABEL[user.role]}${schoolName ? `, escola ${schoolName}` : ""}). Hoje é ${today}.`;
}

const isToolResults = (m: Msg) => m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result");
const blocks = (c: Msg["content"]): Block[] => (typeof c === "string" ? (c ? [{ type: "text", text: c }] : []) : c);

/** Parte do histórico que vai ao modelo: começa numa mensagem da pessoa e encurta resultados antigos de ferramentas. */
function window(history: Msg[]): Msg[] {
  let start = Math.max(0, history.length - HISTORY);
  while (start < history.length && (history[start].role !== "user" || isToolResults(history[start]))) start++;
  const slice = history.slice(start);
  const lastHuman = slice.findLastIndex((m) => m.role === "user" && !isToolResults(m));
  return slice.map((m, i) =>
    i < lastHuman && isToolResults(m)
      ? {
          role: "user",
          content: blocks(m.content).map((b) =>
            b.type === "tool_result" && typeof b.content === "string" && b.content.length > OLD_RESULT ? { ...b, content: `${b.content.slice(0, OLD_RESULT)}… (resultado antigo cortado)` } : b,
          ),
        }
      : m,
  );
}

/** A conversa como a tela mostra: mensagens da pessoa e cada resposta com o que foi feito. */
function turnsOf(history: Msg[]): AssistantTurn[] {
  const turns: AssistantTurn[] = [];
  const pending = new Map<string, AssistantAction>();
  for (const m of history) {
    if (m.role === "user" && !isToolResults(m)) {
      turns.push({ role: "user", text: blocks(m.content).map((b) => (b.type === "text" ? b.text : "")).join("\n"), actions: [] });
      continue;
    }
    let turn = turns.at(-1);
    if (!turn || turn.role !== "assistant") turns.push((turn = { role: "assistant", text: "", actions: [] }));
    for (const b of blocks(m.content)) {
      if (b.type === "text" && m.role === "assistant" && b.text.trim()) turn.text = turn.text ? `${turn.text}\n\n${b.text.trim()}` : b.text.trim();
      if (b.type === "tool_use") {
        const tool = TOOL_BY_NAME.get(b.name);
        const action = { label: tool?.label ?? b.name, ok: false, write: !!tool?.write };
        pending.set(b.id, action);
        // leituras não aparecem na conversa; alterações e lacunas sim
        if (tool?.write || b.name === "registrar_lacuna") turn.actions.push(action);
      }
      if (b.type === "tool_result") {
        const a = pending.get(b.tool_use_id);
        if (a) a.ok = !b.is_error;
      }
    }
  }
  return turns;
}

const summary = (r: { id: string; title: string; updatedAt: Date }): ConversationSummary => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() });

async function ownConversation(user: SessionUser, id: string) {
  const row = await prisma.assistantConversation.findUnique({ where: { id } });
  if (!row || row.userId !== user.id) fail("Conversa não encontrada.");
  return row;
}

async function listFor(user: SessionUser) {
  const rows = await prisma.assistantConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, updatedAt: true } });
  return rows.map(summary);
}

export async function listAssistantConversations() {
  return guard<ConversationSummary[]>(async () => ({ data: await listFor(await requireUser()) }));
}

export async function loadAssistantConversation(id: string) {
  return guard<ConversationView>(async () => {
    const row = await ownConversation(await requireUser(), id);
    return { data: { ...summary(row), turns: turnsOf(row.messages as unknown as Msg[]) } };
  });
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "skillertri.vercel.app";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

/** Uma mensagem da pessoa (numa conversa ou começando uma): a assistente responde usando as ferramentas quantas vezes precisar. */
export async function sendAssistantMessage(conversationId: string | null, text: string) {
  return guard<{ conversation: ConversationView; conversations: ConversationSummary[]; changed: boolean }>(async () => {
    const user = await requireUser();
    const said = text.trim().slice(0, MAX_TEXT);
    if (!said) fail("Escreva uma mensagem.");
    const { apiKey, workspaceId } = aiConfig();
    if (!apiKey) fail("Defina ANTHROPIC_API_KEY no servidor.");

    const db = await readDb();
    const school = db.schools.find((s) => s.id === user.schoolId);
    let id = conversationId;
    let history: Msg[];
    if (id) history = (await ownConversation(user, id)).messages as unknown as Msg[];
    else {
      id = newId();
      history = [];
      await prisma.assistantConversation.create({ data: { id, userId: user.id, title: said.replace(/\s+/g, " ").slice(0, 70), messages: [] } });
    }
    const convId = id;
    const save = (h: Msg[]) => prisma.assistantConversation.update({ where: { id: convId }, data: { messages: JSON.parse(JSON.stringify(h)) as Prisma.InputJsonValue } });
    const push = async (...m: Msg[]) => {
      history = [...history, ...m];
      await save(history);
    };
    await push({ role: "user", content: said });

    const ctx = {
      user,
      origin: await origin(),
      logGap: async (gap: GapInput) => {
        await prisma.assistantGap.create({
          data: {
            id: newId(),
            userId: user.id,
            userName: user.name,
            role: user.role,
            schoolId: school?.id ?? null,
            schoolName: school?.name ?? null,
            conversationId: convId,
            question: (gap.question || said).slice(0, 2000),
            kind: gap.kind,
            topic: gap.topic.slice(0, 200),
            reason: gap.reason.slice(0, 1000),
          },
        });
      },
    };

    const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });
    const sys = [{ type: "text" as const, text: system(user, school?.name), cache_control: { type: "ephemeral" as const } }];
    let changed = false;
    let finished = false;
    for (let step = 0; step < MAX_STEPS && !finished; step++) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 8000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: sys,
          tools: TOOL_DEFINITIONS as Anthropic.Beta.BetaTool[],
          messages: window(history),
        });
      } catch (e) {
        fail(aiErrorMessage(e));
      }
      const content = response.content.filter((b) => b.type === "text" || b.type === "tool_use") as Block[];
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !calls.length) {
        await push({ role: "assistant", content: content.length ? content : [{ type: "text", text: "Não consegui responder agora." }] });
        finished = true;
        break;
      }
      // uma de cada vez: cada alteração lê o estado deixado pela anterior
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const out = await runTool(ctx, call.name, (call.input ?? {}) as Record<string, unknown>);
        if (out.ok && out.write) changed = true;
        results.push({ type: "tool_result", tool_use_id: call.id, content: out.text, ...(out.ok ? {} : { is_error: true }) });
      }
      await push({ role: "assistant", content }, { role: "user", content: results });
    }
    if (!finished) await push({ role: "assistant", content: "Parei aqui para não passar do limite de passos desta mensagem. Diga se devo continuar." });

    const row = await ownConversation(user, convId);
    return { data: { conversation: { ...summary(row), turns: turnsOf(history) }, conversations: await listFor(user), changed } };
  });
}

// ---------- log de lacunas (só o dono) ----------

export async function setGapStatus(id: string, status: "aberta" | "resolvida" | "ignorada", note?: string) {
  return guard(async () => {
    await requireUser({ admin: true });
    if (!["aberta", "resolvida", "ignorada"].includes(status)) fail("Situação inválida.");
    await prisma.assistantGap.update({
      where: { id },
      data: { status, resolvedAt: status === "aberta" ? null : new Date(), ...(note !== undefined ? { note: note.trim() || null } : {}) },
    });
    revalidatePath("/painel/lacunas");
    return "Situação atualizada.";
  });
}

"use server";

import { ChatAnthropic } from "@langchain/anthropic";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser, type SessionUser } from "@/lib/auth";
import { aiConfig, aiErrorMessage } from "@/lib/ai";
import { seesGaps } from "@/lib/assistant/access";
import { userContext } from "@/lib/assistant/context";
import { runSkills } from "@/lib/assistant/skills";
import { TOOL_BY_NAME, TOOL_DEFINITIONS, runTool } from "@/lib/assistant/tools";
import { newId } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { fail, guard } from "@/lib/result";
import type { Prisma } from "@/lib/generated/prisma/client";

// Assistente da plataforma, no LangChain: o contexto de cada pessoa (lib/assistant/context.ts) vira a mensagem de sistema, o
// Sonnet usa as ferramentas de lib/assistant/tools.ts (as mesmas ações das telas, sem nenhuma exclusão) e, depois da resposta
// entregue, as skills (lib/assistant/skills) atualizam a memória da pessoa e anotam as falhas no log de Lacunas.

export type AssistantAction = { label: string; ok: boolean; write: boolean };
export type AssistantTurn = { id: string; role: "user" | "assistant"; text: string; actions: AssistantAction[] };
export type ConversationSummary = { id: string; title: string; updatedAt: string };
export type ConversationView = ConversationSummary & { turns: AssistantTurn[] };

/** Sonnet: bom com ferramentas e bem mais barato que o Opus. */
const MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 16;
/** Mensagens do histórico que vão para o modelo a cada pedido. */
const HISTORY = 60;
const MAX_TEXT = 4000;
const OLD_RESULT = 1500;

const textOf = (m: BaseMessage) =>
  typeof m.content === "string"
    ? m.content
    : m.content
        .map((b) => (b.type === "text" && "text" in b ? String(b.text) : ""))
        .filter(Boolean)
        .join("\n\n");

/** Parte do histórico que vai ao modelo: começa numa mensagem da pessoa e encurta resultados antigos de ferramentas. */
function window(history: BaseMessage[]): BaseMessage[] {
  let start = Math.max(0, history.length - HISTORY);
  while (start < history.length && !HumanMessage.isInstance(history[start])) start++;
  const slice = history.slice(start);
  let lastHuman = slice.length - 1;
  while (lastHuman > 0 && !HumanMessage.isInstance(slice[lastHuman])) lastHuman--;
  return slice.map((m, i) => {
    if (i >= lastHuman || !ToolMessage.isInstance(m) || typeof m.content !== "string" || m.content.length <= OLD_RESULT) return m;
    return new ToolMessage({ tool_call_id: m.tool_call_id, status: m.status, content: `${m.content.slice(0, OLD_RESULT)}… (resultado antigo cortado)` });
  });
}

/** A conversa como a tela mostra: mensagens da pessoa e cada resposta com o que foi feito. */
function turnsOf(history: BaseMessage[]): AssistantTurn[] {
  const turns: AssistantTurn[] = [];
  const pending = new Map<string, AssistantAction>();
  history.forEach((m, i) => {
    if (HumanMessage.isInstance(m)) {
      turns.push({ id: `m${i}`, role: "user", text: textOf(m), actions: [] });
      return;
    }
    let turn = turns.at(-1);
    if (!turn || turn.role !== "assistant") turns.push((turn = { id: `m${i}`, role: "assistant", text: "", actions: [] }));
    if (AIMessage.isInstance(m)) {
      const t = textOf(m).trim();
      if (t) turn.text = turn.text ? `${turn.text}\n\n${t}` : t;
      for (const call of m.tool_calls ?? []) {
        const tool = TOOL_BY_NAME.get(call.name);
        const action = { label: tool?.label ?? call.name, ok: false, write: !!tool?.write };
        if (call.id) pending.set(call.id, action);
        turn.actions.push(action);
      }
    }
    if (ToolMessage.isInstance(m)) {
      const a = pending.get(m.tool_call_id);
      if (a) a.ok = m.status !== "error";
    }
  });
  return turns;
}

const load = (raw: unknown) => mapStoredMessagesToChatMessages((raw ?? []) as StoredMessage[]);
const summary = (r: { id: string; title: string; updatedAt: Date }): ConversationSummary => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() });

async function ownConversation(user: SessionUser, id: string) {
  const row = await prisma.assistantConversation.findUnique({ where: { id } });
  if (!row || row.userId !== user.id) fail("Conversa não encontrada.");
  return row;
}

async function listFor(user: SessionUser) {
  const rows = await prisma.assistantConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true, updatedAt: true } });
  return rows.map(summary);
}

export async function listAssistantConversations() {
  return guard<ConversationSummary[]>(async () => ({ data: await listFor(await requireUser()) }));
}

export async function loadAssistantConversation(id: string) {
  return guard<ConversationView>(async () => {
    const row = await ownConversation(await requireUser(), id);
    return { data: { ...summary(row), turns: turnsOf(load(row.messages)) } };
  });
}

export async function renameAssistantConversation(id: string, title: string) {
  return guard<ConversationSummary[]>(async () => {
    const user = await requireUser();
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!clean) fail("Dê um nome à conversa.");
    await ownConversation(user, id);
    await prisma.assistantConversation.update({ where: { id }, data: { title: clean } });
    return { data: await listFor(user) };
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
    if (!apiKey) fail("O assistente não está configurado no servidor.");
    const clientOptions = workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : undefined;

    let id = conversationId;
    let history: BaseMessage[];
    if (id) history = load((await ownConversation(user, id)).messages);
    else {
      id = newId();
      history = [];
      await prisma.assistantConversation.create({ data: { id, userId: user.id, title: said.replace(/\s+/g, " ").slice(0, 70), messages: [] } });
    }
    const convId = id;
    const push = async (...m: BaseMessage[]) => {
      history = [...history, ...m];
      const stored = JSON.parse(JSON.stringify(mapChatMessagesToStoredMessages(history))) as Prisma.InputJsonValue;
      await prisma.assistantConversation.update({ where: { id: convId }, data: { messages: stored } });
    };
    await push(new HumanMessage(said));

    const { system, school } = await userContext(user);
    const ctx = { user, origin: await origin() };
    const llm = new ChatAnthropic({ model: MODEL, apiKey, maxTokens: 8000, maxRetries: 2, clientOptions }).bindTools(TOOL_DEFINITIONS);
    const done: { label: string; ok: boolean; detail?: string }[] = [];
    let changed = false;
    let finished = false;
    for (let step = 0; step < MAX_STEPS && !finished; step++) {
      let reply: AIMessage;
      try {
        reply = (await llm.invoke([system, ...window(history)])) as AIMessage;
      } catch (e) {
        console.error("assistant", e);
        fail(aiErrorMessage(e));
      }
      const calls = reply.tool_calls ?? [];
      if (!calls.length) {
        await push(textOf(reply).trim() ? reply : new AIMessage("Não consegui responder agora. Tente de novo."));
        finished = true;
        break;
      }
      // uma de cada vez: cada alteração lê o estado deixado pela anterior
      const results: ToolMessage[] = [];
      for (const call of calls) {
        const out = await runTool(ctx, call.name, (call.args ?? {}) as Record<string, unknown>);
        if (out.ok && out.write) changed = true;
        done.push({ label: out.label, ok: out.ok, detail: out.ok ? undefined : out.text });
        results.push(new ToolMessage({ tool_call_id: call.id ?? "", content: out.text, status: out.ok ? "success" : "error" }));
      }
      await push(reply, ...results);
    }
    if (!finished) await push(new AIMessage("Parei aqui para não passar do limite de passos desta mensagem. Diga se devo continuar."));

    // skills em segundo plano, depois de a resposta chegar: memória da pessoa e registro de falhas
    const turns = turnsOf(history);
    const answer = turns.at(-1)?.role === "assistant" ? turns.at(-1)!.text : "";
    after(() => runSkills({ user, school, conversationId: convId, question: said, answer, actions: done, apiKey, clientOptions }));

    const row = await ownConversation(user, convId);
    return { data: { conversation: { ...summary(row), turns }, conversations: await listFor(user), changed } };
  });
}

// ---------- log de lacunas (só para quem está em LACUNAS_USER_IDS) ----------

export async function setGapStatus(id: string, status: "aberta" | "resolvida" | "ignorada", note?: string) {
  return guard(async () => {
    const user = await requireUser({ admin: true });
    if (!seesGaps(user)) fail("Página não encontrada.");
    if (!["aberta", "resolvida", "ignorada"].includes(status)) fail("Situação inválida.");
    await prisma.assistantGap.update({
      where: { id },
      data: { status, resolvedAt: status === "aberta" ? null : new Date(), ...(note !== undefined ? { note: note.trim() || null } : {}) },
    });
    revalidatePath("/painel/configuracoes/lacunas");
    return "Situação atualizada.";
  });
}

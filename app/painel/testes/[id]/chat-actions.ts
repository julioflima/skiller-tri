"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { fail, guard, type Result } from "@/lib/result";
import { aiCredentials, aiErrorMessage } from "@/lib/symbols";
import type { Scale, Stage, Test } from "@/lib/types";
import {
  deleteCategory,
  deleteQuestion,
  deleteScale,
  deleteStage,
  saveCategory,
  saveQuestion,
  saveScale,
  saveStage,
  toggleQuestion,
  updateTestMeta,
} from "../../test-actions";

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ChatReply = { text: string; changes: { ok: boolean; label: string }[] };

const MAX_STEPS = 15;

const SYSTEM = `Você é o assistente de edição de um teste psicológico da plataforma KAY12, usado por terapeutas.
Você conversa em português (Brasil) com a pessoa administradora e altera o teste usando as ferramentas disponíveis.

Como o teste funciona:
- Classificações agrupam as perguntas no resultado (ex.: habilidades). Nunca aparecem para quem responde.
- Escalas de resposta têm opções com peso numérico (ex.: Nunca=0 … Sempre=4).
- Perguntas têm texto, classificação, escala, para quem podem ser feitas (targets: paciente, responsavel, terapeuta),
  perspectivas do paciente (si = sobre si, outro = sobre o outro; obrigatório se targets incluir paciente) e peso (> 0).
- Etapas ("inicial" uma vez no início, "sessao" a cada sessão) têm regras: papel, quantidade de perguntas sorteadas,
  sobre quem (paciente responde "si" ou "outro"; responsável e terapeuta respondem sobre "paciente"),
  classificações (vazio = todas) e uma instrução que aceita {paciente}.

Regras de trabalho:
- O estado atual do teste vem na mensagem da pessoa. Use os ids exatamente como aparecem. Depois de alterar, chame ver_teste se precisar do estado novo (ex.: ids recém-criados).
- Quando o pedido for claro, faça as alterações direto, sem pedir confirmação. Se for ambíguo ou destrutivo em larga escala (excluir várias coisas, reescrever o teste inteiro), pergunte antes.
- Escreva perguntas curtas, claras, em primeira pessoa quando forem para o paciente, adequadas a adolescentes.
- Se uma ferramenta devolver erro, explique o motivo e corrija se puder.
- Ao terminar, resuma em poucas linhas o que mudou. Não use tabelas.`;

const str = { type: "string" } as const;
const ROLE_ENUM = { type: "string", enum: ["paciente", "responsavel", "terapeuta"] } as const;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "ver_teste", description: "Devolve o estado atual completo do teste, com todos os ids.", input_schema: { type: "object", properties: {} } },
  {
    name: "atualizar_dados",
    description: "Altera nome, descrição ou se o teste está ativo. Omita o que não mudar.",
    input_schema: { type: "object", properties: { name: str, description: str, active: { type: "boolean" } } },
  },
  {
    name: "salvar_classificacao",
    description: "Cria (sem id) ou edita (com id) uma classificação.",
    input_schema: { type: "object", properties: { id: str, name: str, description: str }, required: ["name"] },
  },
  { name: "excluir_classificacao", description: "Exclui uma classificação sem perguntas.", input_schema: { type: "object", properties: { id: str }, required: ["id"] } },
  {
    name: "salvar_pergunta",
    description: "Cria (sem id; text, categoryId e scaleId obrigatórios) ou edita (com id; omita os campos que não mudam) uma pergunta.",
    input_schema: {
      type: "object",
      properties: {
        id: str,
        text: str,
        categoryId: str,
        scaleId: str,
        targets: { type: "array", items: ROLE_ENUM },
        perspectives: { type: "array", items: { type: "string", enum: ["si", "outro"] } },
        weight: { type: "number" },
      },
    },
  },
  {
    name: "ativar_pergunta",
    description: "Ativa ou desativa uma pergunta (perguntas inativas não são sorteadas).",
    input_schema: { type: "object", properties: { id: str, active: { type: "boolean" } }, required: ["id", "active"] },
  },
  {
    name: "excluir_pergunta",
    description: "Exclui uma pergunta. Se ela já foi usada em formulários, é desativada em vez de excluída.",
    input_schema: { type: "object", properties: { id: str }, required: ["id"] },
  },
  {
    name: "salvar_escala",
    description: "Cria (sem id) ou substitui (com id) uma escala de respostas inteira. Mantenha os ids das opções que continuam.",
    input_schema: {
      type: "object",
      properties: {
        id: str,
        name: str,
        options: {
          type: "array",
          items: { type: "object", properties: { id: str, label: str, description: str, weight: { type: "number" } }, required: ["label", "weight"] },
        },
      },
      required: ["name", "options"],
    },
  },
  { name: "excluir_escala", description: "Exclui uma escala que nenhuma pergunta usa.", input_schema: { type: "object", properties: { id: str }, required: ["id"] } },
  {
    name: "salvar_etapa",
    description: "Cria (sem id) ou substitui (com id) uma etapa inteira com todas as suas regras. Mantenha os ids das regras que continuam.",
    input_schema: {
      type: "object",
      properties: {
        id: str,
        name: str,
        kind: { type: "string", enum: ["inicial", "sessao"] },
        rules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: str,
              role: ROLE_ENUM,
              count: { type: "integer" },
              about: { type: "string", enum: ["si", "outro", "paciente"] },
              categoryIds: { type: "array", items: str },
              instruction: str,
            },
            required: ["role", "count", "about"],
          },
        },
      },
      required: ["name", "kind", "rules"],
    },
  },
  { name: "excluir_etapa", description: "Exclui uma etapa.", input_schema: { type: "object", properties: { id: str }, required: ["id"] } },
];

/** Versão compacta do teste para a IA (sem símbolos). */
function snapshot(t: Test) {
  return JSON.stringify({
    name: t.name,
    description: t.description,
    active: t.active,
    categories: [...t.categories].sort((a, b) => a.order - b.order).map(({ id, name, description }) => ({ id, name, description })),
    scales: t.scales.map((s) => ({ ...s, options: s.options.map(({ id, label, description, weight }) => ({ id, label, description, weight })) })),
    questions: t.questions.map(({ id, text, categoryId, scaleId, targets, perspectives, weight, active }) => ({
      id,
      text,
      categoryId,
      scaleId,
      targets,
      perspectives,
      weight,
      active,
    })),
    stages: t.stages,
  });
}

async function loadTest(testId: string) {
  const t = (await readDb()).tests.find((x) => x.id === testId);
  if (!t) fail("Teste não encontrado.");
  return t;
}

type Input = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Executa uma ferramenta reaproveitando as ações (e validações) dos editores. */
async function runTool(testId: string, name: string, input: Input): Promise<{ result: Result; label?: string; text?: string }> {
  const t = await loadTest(testId);
  const qText = (id: string) => t.questions.find((q) => q.id === id)?.text ?? id;
  switch (name) {
    case "ver_teste":
      return { result: { ok: true }, text: snapshot(t) };
    case "atualizar_dados":
      return {
        result: await updateTestMeta(testId, input.name ?? t.name, input.description ?? t.description, input.active ?? t.active, t.symbolPrompt ?? ""),
        label: "Dados do teste atualizados",
      };
    case "salvar_classificacao": {
      const cur = input.id ? t.categories.find((c) => c.id === input.id) : undefined;
      return {
        result: await saveCategory(testId, input.id || null, input.name ?? cur?.name ?? "", input.description ?? cur?.description ?? ""),
        label: `${input.id ? "Classificação editada" : "Classificação criada"}: ${input.name}`,
      };
    }
    case "excluir_classificacao":
      return { result: await deleteCategory(testId, input.id), label: `Classificação excluída: ${t.categories.find((c) => c.id === input.id)?.name ?? input.id}` };
    case "salvar_pergunta": {
      const cur = input.id ? t.questions.find((q) => q.id === input.id) : undefined;
      if (input.id && !cur) fail("Pergunta não encontrada.");
      const data = {
        text: input.text ?? cur?.text ?? "",
        categoryId: input.categoryId ?? cur?.categoryId ?? "",
        scaleId: input.scaleId ?? cur?.scaleId ?? t.scales[0]?.id ?? "",
        targets: input.targets ?? cur?.targets ?? ["paciente"],
        perspectives: input.perspectives ?? cur?.perspectives ?? ["si"],
        weight: input.weight ?? cur?.weight ?? 1,
      };
      return { result: await saveQuestion(testId, input.id || null, data), label: `${cur ? "Pergunta editada" : "Pergunta criada"}: ${data.text}` };
    }
    case "ativar_pergunta": {
      const q = t.questions.find((x) => x.id === input.id);
      if (!q) fail("Pergunta não encontrada.");
      const result = q.active === Boolean(input.active) ? ({ ok: true } as Result) : await toggleQuestion(testId, q.id);
      return { result, label: `Pergunta ${input.active ? "ativada" : "desativada"}: ${q.text}` };
    }
    case "excluir_pergunta": {
      const label = `Pergunta excluída: ${qText(input.id)}`;
      return { result: await deleteQuestion(testId, input.id), label };
    }
    case "salvar_escala": {
      const scale: Scale = {
        id: input.id ?? "",
        name: String(input.name ?? ""),
        options: (input.options ?? []).map((o: Input) => ({ id: o.id ?? "", label: String(o.label ?? ""), description: String(o.description ?? ""), weight: Number(o.weight) })),
      };
      return { result: await saveScale(testId, scale), label: `${input.id ? "Escala editada" : "Escala criada"}: ${scale.name}` };
    }
    case "excluir_escala":
      return { result: await deleteScale(testId, input.id), label: `Escala excluída: ${t.scales.find((s) => s.id === input.id)?.name ?? input.id}` };
    case "salvar_etapa": {
      const stage: Stage = {
        id: input.id ?? "",
        name: String(input.name ?? ""),
        kind: input.kind,
        rules: (input.rules ?? []).map((r: Input) => ({
          id: r.id ?? "",
          role: r.role,
          count: Number(r.count),
          about: r.about,
          categoryIds: r.categoryIds ?? [],
          instruction: String(r.instruction ?? ""),
        })),
      };
      return { result: await saveStage(testId, stage), label: `${input.id ? "Etapa editada" : "Etapa criada"}: ${stage.name}` };
    }
    case "excluir_etapa":
      return { result: await deleteStage(testId, input.id), label: `Etapa excluída: ${t.stages.find((s) => s.id === input.id)?.name ?? input.id}` };
    default:
      return { result: { ok: false, error: `Ferramenta desconhecida: ${name}` } };
  }
}

export async function chatWithTest(testId: string, history: ChatTurn[]) {
  return guard<ChatReply>(async () => {
    await requireUser({ admin: true });
    const db = await readDb();
    const test = await loadTest(testId);
    const { apiKey, workspaceId } = aiCredentials(db.settings);
    if (!apiKey) fail("Cadastre a chave da API em Configurações.");
    const turns = history.filter((m) => m.text.trim()).slice(-30);
    if (turns.at(-1)?.role !== "user") fail("Escreva uma mensagem.");

    const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });
    // o estado atual vai junto da última mensagem, para o histórico anterior continuar igual
    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((m, i) => ({
      role: m.role,
      content: i === turns.length - 1 ? `Estado atual do teste:\n${snapshot(test)}\n\nPedido:\n${m.text}` : m.text,
    }));
    const changes: ChatReply["changes"] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: db.settings.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: SYSTEM,
          tools: TOOLS,
          messages,
        });
      } catch (e) {
        fail(aiErrorMessage(e));
      }
      if (response.stop_reason === "refusal") fail("A IA recusou este pedido.");
      if (response.stop_reason === "max_tokens") fail("A resposta da IA foi cortada. Tente um pedido menor.");
      messages.push({ role: "assistant", content: response.content });

      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !calls.length) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { data: { text: text || "Pronto.", changes } };
      }

      // uma de cada vez: cada alteração lê o estado deixado pela anterior
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        let out: Awaited<ReturnType<typeof runTool>>;
        try {
          out = await runTool(testId, call.name, (call.input ?? {}) as Input);
        } catch (e) {
          out = { result: { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." } };
        }
        const r = out.result;
        if (out.label) changes.push({ ok: r.ok, label: r.ok ? out.label : `${out.label} — ${r.error}` });
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: !r.ok,
          content: r.ok ? (out.text ?? r.message ?? "ok") : r.error,
        });
      }
      messages.push({ role: "user", content: results });
    }
    return { data: { text: "Parei aqui porque o pedido exigiu passos demais. Peça para eu continuar se faltar algo.", changes } };
  });
}

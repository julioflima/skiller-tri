import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { newId } from "../../db";
import { prisma } from "../../prisma";
import type { SkillInput } from "./index";

// Skill "registrar falha": depois de cada resposta, lê a troca (pedido, resposta e ações) e decide se a assistente deixou de
// responder ou de fazer o que foi pedido. Se sim, anota no log de Lacunas (/painel/configuracoes/lacunas, só para quem está em
// LACUNAS_USER_IDS). Roda em segundo plano, fora da conversa: a pessoa e a assistente não sabem dela.

export const GAP_KINDS = {
  sem_funcao: "A plataforma não faz isso",
  sem_dados: "Faltam dados",
  conhecimento: "Pergunta de conhecimento",
  permissao: "Sem permissão",
  exclusao: "Pediu para excluir",
  erro: "Deu erro",
  outro: "Outro",
} as const;
type GapKind = keyof typeof GAP_KINDS;

const Verdict = z.object({
  falhou: z.boolean().describe("true se a assistente não respondeu ou não fez o que foi pedido, total ou parcialmente"),
  pedido: z.string().describe("O que a pessoa pediu, nas palavras dela (curto)"),
  tipo: z.enum(Object.keys(GAP_KINDS) as [GapKind, ...GapKind[]]),
  tema: z.string().describe("Tema curto, ex.: relatório em PDF, empatia, agenda de sessões"),
  motivo: z.string().describe("Por que não deu, em uma frase"),
});

const PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Você audita a assistente da plataforma Skiller (acompanhamento de pacientes por testes). Leia a troca e diga se ela FALHOU:
não respondeu, respondeu que não sabe ou não consegue, só deu uma orientação genérica porque a plataforma não cobre o assunto,
uma ferramenta deu erro e o pedido ficou sem fazer, faltou permissão ou dado, ou a pessoa pediu uma exclusão (a assistente nunca exclui).
Não é falha: pedido atendido, pergunta de esclarecimento da assistente, pedido de confirmação antes de gravar, conversa social.
Tipos: ${Object.entries(GAP_KINDS).map(([k, v]) => `${k} = ${v}`).join("; ")}.`,
  ],
  ["human", "Papel de quem pediu: {papel}\n\nPedido:\n{pedido}\n\nAções da assistente:\n{acoes}\n\nResposta da assistente:\n{resposta}"],
]);

export async function registrarFalha({ user, school, conversationId, question, answer, actions, apiKey, clientOptions }: SkillInput) {
  const model = new ChatAnthropic({ model: "claude-haiku-5-5", apiKey, maxTokens: 600, clientOptions }).withStructuredOutput(Verdict, { name: "avaliar_resposta" });
  const v = await PROMPT.pipe(model).invoke({
    papel: user.role,
    pedido: question,
    acoes: actions.map((a) => `${a.ok ? "ok" : "ERRO"} · ${a.label}${a.ok ? "" : ` — ${a.detail ?? ""}`}`).join("\n") || "nenhuma",
    resposta: answer || "(sem texto)",
  });
  if (!v.falhou) return;
  await prisma.assistantGap.create({
    data: {
      id: newId(),
      userId: user.id,
      userName: user.name,
      role: user.role,
      schoolId: school?.id ?? null,
      schoolName: school?.name ?? null,
      conversationId,
      question: (v.pedido || question).slice(0, 2000),
      kind: v.tipo,
      topic: v.tema.slice(0, 200),
      reason: v.motivo.slice(0, 1000),
    },
  });
}

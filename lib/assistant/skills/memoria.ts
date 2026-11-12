import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { prisma } from "../../prisma";
import { userMemory } from "../context";
import type { SkillInput } from "./index";

// Skill "memória": a cada troca, atualiza o resumo do que esta pessoa costuma pedir, como prefere as respostas e em que está
// trabalhando. O contexto de cada pessoa (lib/assistant/context.ts) usa esse resumo nas conversas seguintes.

const MAX = 1200;

const PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Você mantém a memória que a assistente da plataforma Skiller tem de UMA pessoa. Reescreva o resumo juntando o que já havia com
a troca nova: o que ela costuma pedir, pacientes ou assuntos em que está trabalhando (só nomes e ids que apareceram), preferências de
resposta e dificuldades com a plataforma. Tópicos curtos, em português, no máximo ${MAX} caracteres. Nada de senhas, links de
resposta nem dados sensíveis de saúde além do nome do assunto. Se a troca não acrescenta nada, devolva o resumo atual igual.`,
  ],
  ["human", "Resumo atual:\n{atual}\n\nPedido:\n{pedido}\n\nResposta:\n{resposta}\n\nDevolva só o novo resumo."],
]);

export async function atualizarMemoria({ user, question, answer, apiKey, clientOptions }: SkillInput) {
  const atual = await userMemory(user.id);
  const model = new ChatAnthropic({ model: "claude-haiku-5-5", apiKey, maxTokens: 700, clientOptions });
  const summary = (await PROMPT.pipe(model).pipe(new StringOutputParser()).invoke({ atual: atual || "(vazio)", pedido: question, resposta: answer || "(sem texto)" }))
    .trim()
    .slice(0, MAX);
  if (!summary || summary === atual) return;
  await prisma.assistantMemory.upsert({ where: { userId: user.id }, create: { userId: user.id, summary }, update: { summary } });
}

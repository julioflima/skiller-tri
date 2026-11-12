import "server-only";
import type { SessionUser } from "../../auth";
import type { School } from "../../types";
import { atualizarMemoria } from "./memoria";
import { registrarFalha } from "./registrar-falha";

// Skills do assistente: rodam depois que a resposta já foi entregue (next/server after), cada uma com o seu próprio modelo e
// prompt no LangChain. Falha de uma skill nunca afeta a conversa.

export type SkillInput = {
  user: SessionUser;
  school?: School;
  conversationId: string;
  question: string;
  answer: string;
  actions: { label: string; ok: boolean; detail?: string }[];
  apiKey: string;
  clientOptions?: { defaultHeaders?: Record<string, string> };
};

const SKILLS = { registrarFalha, atualizarMemoria };

export async function runSkills(input: SkillInput) {
  const results = await Promise.allSettled(Object.values(SKILLS).map((skill) => skill(input)));
  results.forEach((r, i) => r.status === "rejected" && console.error("assistant skill", Object.keys(SKILLS)[i], r.reason));
}

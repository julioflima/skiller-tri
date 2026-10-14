"use server";

import { updateDb } from "@/lib/db";
import { resolveToken } from "@/lib/portal";

function locate(db: Parameters<typeof resolveToken>[0], token: string, formId: string) {
  const who = resolveToken(db, token);
  const form = db.forms.find((f) => f.id === formId);
  if (!who || !form || !who.owns(form)) throw new Error("Formulário indisponível.");
  if (form.finishedAt) throw new Error("Este formulário já foi enviado.");
  return form;
}

/** Teto por pergunta: acima disso a pessoa provavelmente se afastou da tela. */
const MAX_ELAPSED_MS = 10 * 60 * 1000;

export async function saveAnswer(token: string, formId: string, index: number, optionId: string, elapsedMs?: number) {
  return updateDb((db) => {
    const form = locate(db, token, formId);
    const item = form.items[index];
    if (!item) throw new Error("Pergunta inválida.");
    const test = db.tests.find((t) => t.id === form.testId);
    const q = test?.questions.find((x) => x.id === item.questionId);
    const scale = test?.scales.find((s) => s.id === q?.scaleId);
    const option = scale?.options.find((o) => o.id === optionId);
    if (!scale || !option) throw new Error("Resposta inválida.");
    const weights = scale.options.map((o) => o.weight);
    const prev = form.answers[index];
    const elapsed = Number.isFinite(elapsedMs) ? Math.round(Math.min(Math.max(elapsedMs!, 0), MAX_ELAPSED_MS)) : undefined;
    form.answers[index] = {
      optionId,
      weight: option.weight,
      min: Math.min(...weights),
      max: Math.max(...weights),
      answeredAt: new Date().toISOString(),
      elapsedMs: elapsed === undefined ? prev?.elapsedMs : (prev?.elapsedMs ?? 0) + elapsed,
      changes: prev ? (prev.changes ?? 0) + (prev.optionId === optionId ? 0 : 1) : 0,
    };
    return true;
  });
}

export async function finishForm(token: string, formId: string) {
  return updateDb((db) => {
    const form = locate(db, token, formId);
    const missing = form.items.length - Object.keys(form.answers).length;
    if (missing > 0) throw new Error(`Faltam ${missing} respostas.`);
    form.finishedAt = new Date().toISOString();
    return true;
  });
}

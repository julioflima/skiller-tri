import { GUARDIAN_LABEL, seriesKey } from "./forms";
import type { Answer, Form, Patient, Test } from "./types";

/** Resposta normalizada de 0 a 1 segundo a escala usada no momento da resposta. */
export function normalized(a: Answer) {
  return a.max === a.min ? 0 : (a.weight - a.min) / (a.max - a.min);
}

export type Series = { key: string; label: string };

export function seriesLabel(patient: Patient, key: string) {
  if (key === "paciente:si") return "Paciente · sobre si";
  if (key === "paciente:outro") return "Paciente · sobre o outro";
  if (key === "terapeuta") return "Terapeuta";
  if (key.startsWith("responsavel:")) {
    const g = patient.guardians.find((x) => x.id === key.slice("responsavel:".length));
    return g ? `${GUARDIAN_LABEL[g.kind]} · ${g.name.split(" ")[0]}` : "Responsável";
  }
  return key;
}

export type CategoryScores = Map<string, Map<string, { pct: number; n: number }>>;

/** Percentual ponderado (0–100) por série e classificação. */
export function scoreForms(test: Test, forms: Form[]): CategoryScores {
  const acc = new Map<string, Map<string, { sum: number; w: number; n: number }>>();
  const byId = new Map(test.questions.map((q) => [q.id, q]));
  for (const form of forms) {
    form.items.forEach((item, idx) => {
      const ans = form.answers[idx];
      const q = byId.get(item.questionId);
      if (!ans || !q) return;
      const key = seriesKey(form, item);
      const cats = acc.get(key) ?? new Map();
      acc.set(key, cats);
      const c = cats.get(q.categoryId) ?? { sum: 0, w: 0, n: 0 };
      c.sum += normalized(ans) * q.weight;
      c.w += q.weight;
      c.n += 1;
      cats.set(q.categoryId, c);
    });
  }
  const out: CategoryScores = new Map();
  for (const [key, cats] of acc) {
    const m = new Map<string, { pct: number; n: number }>();
    for (const [cat, c] of cats) m.set(cat, { pct: c.w ? (c.sum / c.w) * 100 : 0, n: c.n });
    out.set(key, m);
  }
  return out;
}

/** Percentual geral (todas as classificações) de um conjunto de respostas por série. */
export function overallBySeries(test: Test, forms: Form[]) {
  const byId = new Map(test.questions.map((q) => [q.id, q]));
  const acc = new Map<string, { sum: number; w: number }>();
  for (const form of forms) {
    form.items.forEach((item, idx) => {
      const ans = form.answers[idx];
      const q = byId.get(item.questionId);
      if (!ans || !q) return;
      const key = seriesKey(form, item);
      const c = acc.get(key) ?? { sum: 0, w: 0 };
      c.sum += normalized(ans) * q.weight;
      c.w += q.weight;
      acc.set(key, c);
    });
  }
  return new Map([...acc].map(([k, c]) => [k, c.w ? (c.sum / c.w) * 100 : 0]));
}

export function band(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return { label: "Sem dados", tone: "muted" };
  if (pct < 25) return { label: "Não demonstrado", tone: "low" };
  if (pct < 50) return { label: "Desenvolvimento inicial", tone: "low" };
  if (pct < 75) return { label: "Em desenvolvimento", tone: "mid" };
  return { label: "Consolidada", tone: "high" };
}

export const SERIES_ORDER = (key: string) =>
  key === "paciente:si" ? 0 : key === "paciente:outro" ? 1 : key.startsWith("responsavel:") ? 2 : 3;

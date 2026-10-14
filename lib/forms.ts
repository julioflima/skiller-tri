import type { About, Db, Form, FormBlock, FormItem, Guardian, Patient, Question, RespondentRole, Stage, StageRule, Test } from "./types";

export const ROLE_LABEL: Record<RespondentRole, string> = {
  paciente: "Paciente",
  responsavel: "Responsável (mãe/pai)",
  terapeuta: "Terapeuta",
};

export const ABOUT_LABEL: Record<About, string> = {
  si: "sobre si",
  outro: "sobre o outro",
  paciente: "sobre o paciente",
};

export const GUARDIAN_LABEL = { mae: "Mãe", pai: "Pai" } as const;

/** Composição familiar: M = masculino (pai), F = feminino (mãe). Ex.: MF, MM, FF. */
export function familyCode(guardians: Guardian[]) {
  if (!guardians.length) return "—";
  const m = guardians.filter((g) => g.kind === "pai").length;
  const f = guardians.filter((g) => g.kind === "mae").length;
  return "M".repeat(m) + "F".repeat(f);
}

export function familyDescription(guardians: Guardian[]) {
  const m = guardians.filter((g) => g.kind === "pai").length;
  const f = guardians.filter((g) => g.kind === "mae").length;
  const parts = [m === 1 ? "um pai" : m > 1 ? `${m} pais` : "", f === 1 ? "uma mãe" : f > 1 ? `${f} mães` : ""].filter(Boolean);
  return parts.length ? parts.join(" e ") : "sem responsáveis cadastrados";
}

export function respondentName(patient: Patient, form: Pick<Form, "respondent">, therapistName?: string) {
  const r = form.respondent;
  if (r.role === "paciente") return patient.name;
  if (r.role === "terapeuta") return therapistName ?? "Terapeuta";
  const g = patient.guardians.find((x) => x.id === r.guardianId);
  return g ? `${g.name} (${GUARDIAN_LABEL[g.kind]})` : "Responsável";
}

/** Rótulo curto de uma "série" de resultados: Paciente · sobre si, Mãe · Ana, Terapeuta… */
export function seriesKey(form: Form, item: FormItem) {
  const r = form.respondent;
  if (r.role === "paciente") return `paciente:${item.about}`;
  if (r.role === "responsavel") return `responsavel:${r.guardianId}`;
  return "terapeuta";
}

export function poolFor(test: Test, rule: StageRule): Question[] {
  return test.questions.filter((q) => {
    if (!q.active || !q.targets.includes(rule.role)) return false;
    if (rule.categoryIds.length && !rule.categoryIds.includes(q.categoryId)) return false;
    if (rule.role === "paciente" && (rule.about === "si" || rule.about === "outro") && q.perspectives.length) {
      return q.perspectives.includes(rule.about);
    }
    return true;
  });
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sorteia `count` perguntas do banco: primeiro as que esta pessoa respondeu menos vezes
 * (rodízio), equilibrando as classificações e sem repetir dentro do mesmo formulário.
 */
function pick(pool: Question[], count: number, timesAsked: Map<string, number>, exclude: Set<string>) {
  const candidates = shuffle(pool.filter((q) => !exclude.has(q.id)));
  const chosen: Question[] = [];
  const perCategory = new Map<string, number>();
  while (chosen.length < count && candidates.length) {
    let best = 0;
    for (let i = 1; i < candidates.length; i++) {
      const a = candidates[i];
      const b = candidates[best];
      const ta = timesAsked.get(a.id) ?? 0;
      const tb = timesAsked.get(b.id) ?? 0;
      if (ta !== tb ? ta < tb : (perCategory.get(a.categoryId) ?? 0) < (perCategory.get(b.categoryId) ?? 0)) best = i;
    }
    const [q] = candidates.splice(best, 1);
    chosen.push(q);
    perCategory.set(q.categoryId, (perCategory.get(q.categoryId) ?? 0) + 1);
  }
  return chosen;
}

type RespondentRef = { role: RespondentRole; guardianId?: string };

function respondentsFor(patient: Patient, role: RespondentRole): RespondentRef[] {
  if (role === "responsavel") return patient.guardians.map((g) => ({ role, guardianId: g.id }));
  return [{ role }];
}

const sameRespondent = (a: RespondentRef, b: RespondentRef) => a.role === b.role && (a.guardianId ?? "") === (b.guardianId ?? "");

/** Monta os formulários de uma etapa: um por pessoa, juntando os blocos de todas as regras do papel dela. */
export function buildForms(db: Db, patient: Patient, test: Test, stage: Stage, sessionNumber: number, only?: RespondentRef[]): Form[] {
  const forms: Form[] = [];
  const roles = [...new Set(stage.rules.map((r) => r.role))];
  for (const role of roles) {
    for (const who of respondentsFor(patient, role)) {
      if (only && !only.some((o) => sameRespondent(o, who))) continue;
      const history = db.forms.filter((f) => f.patientId === patient.id && sameRespondent(f.respondent, who));
      const blocks: FormBlock[] = [];
      const items: FormItem[] = [];
      for (const rule of stage.rules.filter((r) => r.role === role)) {
        const timesAsked = new Map<string, number>();
        for (const f of history) for (const it of f.items) if (it.about === rule.about) timesAsked.set(it.questionId, (timesAsked.get(it.questionId) ?? 0) + 1);
        const exclude = new Set(items.filter((it) => it.about === rule.about).map((it) => it.questionId));
        const chosen = pick(poolFor(test, rule), rule.count, timesAsked, exclude);
        if (!chosen.length) continue;
        const block = blocks.length;
        blocks.push({ about: rule.about, instruction: rule.instruction.replaceAll("{paciente}", patient.name.split(" ")[0]) });
        for (const q of chosen) items.push({ questionId: q.id, about: rule.about, block });
      }
      if (!items.length) continue;
      forms.push({
        id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
        patientId: patient.id,
        testId: test.id,
        stageId: stage.id,
        stageName: stage.name,
        sessionNumber,
        respondent: who,
        blocks,
        items,
        answers: {},
        createdAt: new Date().toISOString(),
      });
    }
  }
  return forms;
}

/** Cria os formulários da etapa inicial que ainda faltam (ex.: quando um responsável é cadastrado depois). */
export function ensureInitialForms(db: Db, patient: Patient) {
  const test = db.tests.find((t) => t.id === patient.testId);
  if (!test) return 0;
  let created = 0;
  for (const stage of test.stages.filter((s) => s.kind === "inicial")) {
    const missing = stage.rules
      .flatMap((r) => respondentsFor(patient, r.role))
      .filter((who) => !db.forms.some((f) => f.patientId === patient.id && f.stageId === stage.id && sameRespondent(f.respondent, who)));
    if (!missing.length) continue;
    const forms = buildForms(db, patient, test, stage, 0, missing);
    db.forms.push(...forms);
    created += forms.length;
  }
  return created;
}

export function formProgress(form: Form) {
  const total = form.items.length;
  const done = Object.keys(form.answers).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

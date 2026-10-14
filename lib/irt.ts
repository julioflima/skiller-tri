/**
 * Teoria de Resposta ao Item: Modelo de Escala Gradual de Andrich (Rating Scale Model, família Rasch),
 * um modelo unidimensional por classificação (habilidade).
 *
 *   P(X = k | θ) ∝ exp( Σ_{j=1..k} (θ − b_i − τ_j) )
 *
 * θ = nível da pessoa na habilidade, b_i = dificuldade da pergunta, τ_j = limiares da escala (comuns a todas
 * as perguntas da habilidade). Os parâmetros das perguntas são calibrados por máxima verossimilhança conjunta
 * (JML) com todas as respostas do teste; o θ de cada pessoa é estimado por EAP, com priori N(0, 1).
 * Com poucas respostas (menos de ~70 pessoas por habilidade) as estimativas ainda são instáveis.
 */
import { seriesKey } from "./forms";
import { normalized } from "./scoring";
import type { Answer, Form, Test } from "./types";

export type IrtItem = { questionId: string; b: number; n: number; infit: number; outfit: number; meanScore: number };

export type IrtCategory = {
  categoryId: string;
  /** Número de opções da escala usada nesta habilidade. */
  K: number;
  /** Limiares τ_1..τ_{K−1} (τ[0] = 0, não usado). */
  tau: number[];
  items: Map<string, IrtItem>;
  /** Pessoas (paciente × quem respondeu) usadas na calibração, sem as de escore extremo. */
  persons: number;
  responses: number;
  /** Confiabilidade de separação de pessoas (0–1), análoga ao alfa de Cronbach. */
  reliability: number;
  converged: boolean;
};

export type IrtCalibration = Map<string, IrtCategory>;

/** Mínimo de pessoas para calibrar uma habilidade. */
export const IRT_MIN_PERSONS = 10;
/** A partir daqui as estimativas passam a ser consideradas estáveis. */
export const IRT_STABLE_PERSONS = 70;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Probabilidade de cada categoria 0..K−1. */
export function categoryProbs(theta: number, b: number, tau: number[]) {
  const K = tau.length;
  const s = new Array<number>(K);
  s[0] = 0;
  for (let k = 1; k < K; k++) s[k] = s[k - 1] + (theta - b - tau[k]);
  const m = Math.max(...s);
  const e = s.map((v) => Math.exp(v - m));
  const z = e.reduce((a, c) => a + c, 0);
  return e.map((v) => v / z);
}

function moments(p: number[]) {
  let E = 0;
  let E2 = 0;
  p.forEach((v, k) => {
    E += k * v;
    E2 += k * k * v;
  });
  return { E, V: Math.max(E2 - E * E, 1e-9) };
}

/** Converte uma resposta na categoria 0..K−1 pela posição da opção na escala (ordem dos pesos). */
function categoryOf(test: Test, questionId: string, a: Answer): { x: number; K: number } | null {
  const q = test.questions.find((x) => x.id === questionId);
  const scale = test.scales.find((s) => s.id === q?.scaleId);
  if (!q || !scale || scale.options.length < 2) return null;
  const K = scale.options.length;
  const ordered = [...scale.options].sort((u, v) => u.weight - v.weight);
  const pos = ordered.findIndex((o) => o.id === a.optionId);
  return { x: pos >= 0 ? pos : Math.round(normalized(a) * (K - 1)), K };
}

type Resp = { p: number; i: number; x: number };

/** Calibra os parâmetros das perguntas de cada habilidade com todas as respostas do teste. */
export function calibrate(test: Test, forms: Form[]): IrtCalibration {
  const out: IrtCalibration = new Map();
  const catOf = new Map(test.questions.map((q) => [q.id, q.categoryId]));

  // respostas agrupadas por habilidade; "pessoa" = um paciente visto por um respondente (ele mesmo, cada
  // responsável, terapeuta), somando todos os formulários: mais perguntas por pessoa, menos viés no JML
  const raw = new Map<string, { person: string; qid: string; x: number; K: number }[]>();
  for (const f of forms) {
    f.items.forEach((item, idx) => {
      const a = f.answers[idx];
      const cat = catOf.get(item.questionId);
      if (!a || !cat) return;
      const c = categoryOf(test, item.questionId, a);
      if (!c) return;
      const list = raw.get(cat) ?? [];
      list.push({ person: `${f.patientId}:${seriesKey(f, item)}`, qid: item.questionId, ...c });
      raw.set(cat, list);
    });
  }

  for (const [categoryId, list0] of raw) {
    // usa a escala mais comum da habilidade (o modelo pede o mesmo número de categorias)
    const kCount = new Map<number, number>();
    for (const r of list0) kCount.set(r.K, (kCount.get(r.K) ?? 0) + 1);
    const K = [...kCount].sort((a, b) => b[1] - a[1])[0][0];
    let list = list0.filter((r) => r.K === K);

    // remove pessoas e perguntas com escore extremo (θ ou b infinitos)
    for (let pass = 0; pass < 3; pass++) {
      const extreme = (key: (r: (typeof list)[number]) => string) => {
        const agg = new Map<string, { s: number; n: number }>();
        for (const r of list) {
          const a = agg.get(key(r)) ?? { s: 0, n: 0 };
          a.s += r.x;
          a.n += 1;
          agg.set(key(r), a);
        }
        return new Set([...agg].filter(([, a]) => a.s === 0 || a.s === a.n * (K - 1)).map(([k]) => k));
      };
      const xp = extreme((r) => r.person);
      list = list.filter((r) => !xp.has(r.person));
      const xi = extreme((r) => r.qid);
      list = list.filter((r) => !xi.has(r.qid));
      if (!xp.size && !xi.size) break;
    }

    const personIds = [...new Set(list.map((r) => r.person))];
    const itemIds = [...new Set(list.map((r) => r.qid))];
    if (personIds.length < IRT_MIN_PERSONS || itemIds.length < 2) continue;
    const pIdx = new Map(personIds.map((p, i) => [p, i]));
    const iIdx = new Map(itemIds.map((q, i) => [q, i]));
    const resp: Resp[] = list.map((r) => ({ p: pIdx.get(r.person)!, i: iIdx.get(r.qid)!, x: r.x }));

    const theta = new Array<number>(personIds.length).fill(0);
    const b = new Array<number>(itemIds.length).fill(0);
    const tau = new Array<number>(K).fill(0);
    let converged = false;

    for (let it = 0; it < 500; it++) {
      let maxStep = 0;

      // pessoas
      const gP = new Array<number>(theta.length).fill(0);
      const hP = new Array<number>(theta.length).fill(0);
      for (const r of resp) {
        const { E, V } = moments(categoryProbs(theta[r.p], b[r.i], tau));
        gP[r.p] += r.x - E;
        hP[r.p] += V;
      }
      theta.forEach((_, p) => {
        const step = clamp(gP[p] / hP[p], -1, 1);
        theta[p] = clamp(theta[p] + step, -6, 6);
        maxStep = Math.max(maxStep, Math.abs(step));
      });

      // perguntas
      const gI = new Array<number>(b.length).fill(0);
      const hI = new Array<number>(b.length).fill(0);
      for (const r of resp) {
        const { E, V } = moments(categoryProbs(theta[r.p], b[r.i], tau));
        gI[r.i] += r.x - E;
        hI[r.i] += V;
      }
      b.forEach((_, i) => {
        const step = clamp(-gI[i] / hI[i], -1, 1);
        b[i] = clamp(b[i] + step, -6, 6);
        maxStep = Math.max(maxStep, Math.abs(step));
      });
      const mb = b.reduce((a, c) => a + c, 0) / b.length;
      for (let i = 0; i < b.length; i++) b[i] -= mb; // identificação: média das dificuldades = 0

      // limiares da escala
      const gT = new Array<number>(K).fill(0);
      const hT = new Array<number>(K).fill(0);
      for (const r of resp) {
        const p = categoryProbs(theta[r.p], b[r.i], tau);
        let ge = 0;
        for (let j = K - 1; j >= 1; j--) {
          ge += p[j];
          gT[j] += ge - (r.x >= j ? 1 : 0);
          hT[j] += ge * (1 - ge);
        }
      }
      for (let j = 1; j < K; j++) {
        const step = clamp(gT[j] / Math.max(hT[j], 1e-9), -1, 1);
        tau[j] = clamp(tau[j] + step, -6, 6);
        maxStep = Math.max(maxStep, Math.abs(step));
      }
      const mt = tau.slice(1).reduce((a, c) => a + c, 0) / (K - 1);
      for (let j = 1; j < K; j++) tau[j] -= mt;

      if (maxStep < 1e-3) {
        converged = true;
        break;
      }
    }

    // ajuste das perguntas (infit/outfit: 1 = ideal; acima de 1,3 = respostas erráticas; abaixo de 0,7 = redundante)
    const fit = itemIds.map(() => ({ sq: 0, v: 0, z2: 0, n: 0, s: 0 }));
    const infoP = new Array<number>(theta.length).fill(0);
    for (const r of resp) {
      const { E, V } = moments(categoryProbs(theta[r.p], b[r.i], tau));
      const f = fit[r.i];
      f.sq += (r.x - E) ** 2;
      f.v += V;
      f.z2 += (r.x - E) ** 2 / V;
      f.n += 1;
      f.s += r.x;
      infoP[r.p] += V;
    }
    const items = new Map<string, IrtItem>(
      itemIds.map((qid, i) => [
        qid,
        { questionId: qid, b: b[i], n: fit[i].n, infit: fit[i].sq / fit[i].v, outfit: fit[i].z2 / fit[i].n, meanScore: fit[i].s / fit[i].n },
      ]),
    );

    const mθ = theta.reduce((a, c) => a + c, 0) / theta.length;
    const varθ = theta.reduce((a, c) => a + (c - mθ) ** 2, 0) / Math.max(theta.length - 1, 1);
    const mse = infoP.reduce((a, c) => a + 1 / c, 0) / infoP.length;
    const reliability = varθ > 0 ? clamp((varθ - mse) / varθ, 0, 1) : 0;

    out.set(categoryId, { categoryId, K, tau, items, persons: personIds.length, responses: resp.length, reliability, converged });
  }
  return out;
}

const GRID = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05);

/** θ por EAP (média a posteriori, priori normal padrão) e erro-padrão (desvio a posteriori). */
export function eap(cal: IrtCategory, responses: { questionId: string; x: number }[]) {
  const usable = responses.filter((r) => cal.items.has(r.questionId) && r.x >= 0 && r.x < cal.K);
  if (!usable.length) return null;
  const logPost = GRID.map((t) => {
    let l = -0.5 * t * t;
    for (const r of usable) l += Math.log(categoryProbs(t, cal.items.get(r.questionId)!.b, cal.tau)[r.x] + 1e-300);
    return l;
  });
  const m = Math.max(...logPost);
  const w = logPost.map((l) => Math.exp(l - m));
  const z = w.reduce((a, c) => a + c, 0);
  const theta = GRID.reduce((a, t, i) => a + t * w[i], 0) / z;
  const se = Math.sqrt(GRID.reduce((a, t, i) => a + (t - theta) ** 2 * w[i], 0) / z);
  return { theta, se, n: usable.length };
}

export type IrtScores = Map<string, Map<string, { theta: number; se: number; n: number }>>;

/** θ por série (paciente sobre si, cada responsável, terapeuta…) e habilidade. */
export function irtScores(test: Test, cal: IrtCalibration, forms: Form[]): IrtScores {
  const catOf = new Map(test.questions.map((q) => [q.id, q.categoryId]));
  const acc = new Map<string, Map<string, { questionId: string; x: number }[]>>();
  for (const f of forms) {
    f.items.forEach((item, idx) => {
      const a = f.answers[idx];
      const cat = catOf.get(item.questionId);
      if (!a || !cat || !cal.has(cat)) return;
      const c = categoryOf(test, item.questionId, a);
      if (!c || c.K !== cal.get(cat)!.K) return;
      const key = seriesKey(f, item);
      const cats = acc.get(key) ?? new Map();
      acc.set(key, cats);
      const list = cats.get(cat) ?? [];
      list.push({ questionId: item.questionId, x: c.x });
      cats.set(cat, list);
    });
  }
  const out: IrtScores = new Map();
  for (const [key, cats] of acc) {
    const m = new Map<string, { theta: number; se: number; n: number }>();
    for (const [cat, list] of cats) {
      const e = eap(cal.get(cat)!, list);
      if (e) m.set(cat, e);
    }
    out.set(key, m);
  }
  return out;
}

/** Percentil aproximado de θ na população de calibração (θ ~ N(0,1)). */
export function thetaPercentile(theta: number) {
  // aproximação de Abramowitz–Stegun para a normal acumulada
  const t = 1 / (1 + 0.2316419 * Math.abs(theta));
  const d = 0.3989423 * Math.exp((-theta * theta) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.round((theta > 0 ? 1 - p : p) * 100);
}

/** Estatística básica sem dependências: correlações, k-means e PCA para o painel de análise. */

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Postos com empates pela média (usados no Spearman). */
export function ranks(xs: number[]) {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function pearson(x: number[], y: number[]) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export function spearman(x: number[], y: number[]) {
  return pearson(ranks(x), ranks(y));
}

export type CorrMethod = "spearman" | "pearson";

/**
 * Matriz de correlação entre colunas, usando só as linhas em que as duas colunas têm valor
 * (pairwise complete). Pares com menos de `minN` observações ficam NaN.
 */
export function correlationMatrix(rows: (number | null)[][], method: CorrMethod, minN = 5) {
  const p = rows[0]?.length ?? 0;
  const r: number[][] = Array.from({ length: p }, () => new Array(p).fill(NaN));
  const n: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const f = method === "spearman" ? spearman : pearson;
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of rows) {
        if (row[a] === null || row[b] === null) continue;
        xs.push(row[a] as number);
        ys.push(row[b] as number);
      }
      n[a][b] = n[b][a] = xs.length;
      const v = a === b ? 1 : xs.length >= minN ? f(xs, ys) : NaN;
      r[a][b] = r[b][a] = v;
    }
  }
  return { r, n };
}

/** Preenche valores ausentes com a média da coluna. */
export function impute(rows: (number | null)[][]) {
  const p = rows[0]?.length ?? 0;
  const means = Array.from({ length: p }, (_, j) => mean(rows.map((r) => r[j]).filter((v): v is number => v !== null)));
  return rows.map((r) => r.map((v, j) => (v === null ? (Number.isNaN(means[j]) ? 0 : means[j]) : v)));
}

/** Gerador pseudoaleatório com semente, para os clusters não mudarem a cada recarga. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist2 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);

/** k-means com inicialização k-means++ e algumas reinicializações; devolve a melhor. */
export function kmeans(points: number[][], k: number, restarts = 8) {
  const n = points.length;
  if (n === 0 || k < 1) return { labels: [] as number[], centers: [] as number[][], inertia: 0 };
  k = Math.min(k, n);
  const rand = rng(42);
  let best = { labels: [] as number[], centers: [] as number[][], inertia: Infinity };
  for (let r = 0; r < restarts; r++) {
    const centers: number[][] = [points[Math.floor(rand() * n)]];
    while (centers.length < k) {
      const d = points.map((p) => Math.min(...centers.map((c) => dist2(p, c))));
      const total = d.reduce((a, b) => a + b, 0);
      let t = rand() * total;
      let i = 0;
      while (i < n - 1 && (t -= d[i]) > 0) i++;
      centers.push(points[i]);
    }
    let labels = new Array<number>(n).fill(-1);
    for (let it = 0; it < 100; it++) {
      const next = points.map((p) => {
        let bi = 0;
        for (let c = 1; c < k; c++) if (dist2(p, centers[c]) < dist2(p, centers[bi])) bi = c;
        return bi;
      });
      const changed = next.some((l, i) => l !== labels[i]);
      labels = next;
      for (let c = 0; c < k; c++) {
        const members = points.filter((_, i) => labels[i] === c);
        if (members.length) centers[c] = members[0].map((_, j) => mean(members.map((m) => m[j])));
      }
      if (!changed) break;
    }
    const inertia = points.reduce((s, p, i) => s + dist2(p, centers[labels[i]]), 0);
    if (inertia < best.inertia) best = { labels, centers: centers.map((c) => [...c]), inertia };
  }
  return best;
}

/** Coeficiente de silhueta médio (−1 a 1): quanto os grupos estão bem separados. */
export function silhouette(points: number[][], labels: number[]) {
  const k = Math.max(...labels) + 1;
  if (k < 2 || points.length <= k) return NaN;
  const s = points.map((p, i) => {
    const byCluster = Array.from({ length: k }, () => [] as number[]);
    points.forEach((q, j) => {
      if (j !== i) byCluster[labels[j]].push(Math.sqrt(dist2(p, q)));
    });
    const own = byCluster[labels[i]];
    if (!own.length) return 0;
    const a = mean(own);
    const b = Math.min(...byCluster.filter((_, c) => c !== labels[i] && byCluster[c].length).map(mean));
    return Number.isFinite(b) ? (b - a) / Math.max(a, b) : 0;
  });
  return mean(s);
}

/** Projeção nas duas primeiras componentes principais (iteração de potência com deflação). */
export function pca2(points: number[][]) {
  const n = points.length;
  const p = points[0]?.length ?? 0;
  if (n < 2 || p < 2) return { coords: points.map(() => [0, 0]), explained: [0, 0] };
  const mu = Array.from({ length: p }, (_, j) => mean(points.map((r) => r[j])));
  const X = points.map((r) => r.map((v, j) => v - mu[j]));
  const C = Array.from({ length: p }, (_, a) =>
    Array.from({ length: p }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0) / (n - 1)),
  );
  const trace = C.reduce((s, row, i) => s + row[i], 0);
  const comps: number[][] = [];
  const vals: number[] = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: p }, (_, i) => (i === c ? 1 : 0.5));
    for (let it = 0; it < 200; it++) {
      const w = C.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
      v = w.map((x) => x / norm);
    }
    const lambda = v.reduce((s, x, i) => s + x * C[i].reduce((t, y, j) => t + y * v[j], 0), 0);
    comps.push(v);
    vals.push(lambda);
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) C[a][b] -= lambda * v[a] * v[b];
  }
  return {
    coords: X.map((r) => comps.map((v) => r.reduce((s, x, j) => s + x * v[j], 0))),
    explained: vals.map((l) => (trace ? Math.max(0, l) / trace : 0)),
  };
}

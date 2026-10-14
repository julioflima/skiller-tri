import Link from "next/link";
import { canSeePatient, requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { calibrate, IRT_STABLE_PERSONS } from "@/lib/irt";
import { scoreForms } from "@/lib/scoring";
import { correlationMatrix, dec, impute, kmeans, mean, median, pca2, silhouette, type CorrMethod } from "@/lib/stats";
import { FAST_MS, fmtSeconds, SLOW_MS } from "@/lib/timing";
import { SERIES_COLORS, shortName } from "@/app/components/Radar";
import type { Category, Patient } from "@/lib/types";

const SERIES = [
  { key: "paciente:si", label: "Paciente sobre si" },
  { key: "responsavel", label: "Mãe/pai" },
  { key: "terapeuta", label: "Terapeuta" },
  { key: "todas", label: "Todas as visões sobre o paciente" },
] as const;

/** Abaixo disso não há como separar grupos. */
const MIN_CLUSTER = 6;

type Search = { teste?: string; serie?: string; metodo?: string; k?: string };

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const db = await readDb();
  const tests = db.tests.filter((t) => db.forms.some((f) => f.testId === t.id && Object.keys(f.answers).length));
  const test = tests.find((t) => t.id === sp.teste) ?? tests[0];
  const serie = SERIES.find((s) => s.key === sp.serie)?.key ?? "paciente:si";
  const metodo: CorrMethod = sp.metodo === "pearson" ? "pearson" : "spearman";
  const k = Math.min(Math.max(Number(sp.k) || 3, 2), 5);
  const href = (q: Search) => {
    const u = new URLSearchParams({ teste: test?.id ?? "", serie, metodo, k: String(k), ...q });
    return `/painel/analise?${u}`;
  };
  const tab = (active: boolean, to: Search, label: string) => (
    <Link key={label} href={href(to)} className={`tab${active ? " active" : ""}`}>
      {label}
    </Link>
  );

  if (!test) {
    return (
      <div className="stack">
        <h1>Análise</h1>
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Ainda não há respostas. A análise aparece quando os primeiros formulários forem respondidos.
          </p>
        </div>
      </div>
    );
  }

  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const patients = db.patients.filter((p) => p.testId === test.id && canSeePatient(user, p));
  const visibleIds = new Set(patients.map((p) => p.id));
  const testForms = db.forms.filter((f) => f.testId === test.id);
  const myForms = testForms.filter((f) => visibleIds.has(f.patientId));

  // um perfil (vetor de percentuais por habilidade) por paciente, na visão escolhida
  const profiles: { patient: Patient; values: (number | null)[] }[] = [];
  for (const p of patients) {
    const scores = scoreForms(
      test,
      myForms.filter((f) => f.patientId === p.id),
    );
    const keys = [...scores.keys()].filter((key) =>
      serie === "todas" ? key !== "paciente:outro" : serie === "responsavel" ? key.startsWith("responsavel:") : key === serie,
    );
    if (!keys.length) continue;
    const values = categories.map((c) => {
      const vs = keys.map((key) => scores.get(key)?.get(c.id)?.pct).filter((v): v is number => v !== undefined);
      return vs.length ? mean(vs) : null;
    });
    if (values.some((v) => v !== null)) profiles.push({ patient: p, values });
  }

  const corr = correlationMatrix(
    profiles.map((p) => p.values),
    metodo,
  );
  const pairs = categories
    .flatMap((a, i) => categories.slice(i + 1).map((b, d) => ({ a, b, r: corr.r[i][i + 1 + d], n: corr.n[i][i + 1 + d] })))
    .filter((x) => Number.isFinite(x.r))
    .sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  // clusters: só com perfis que cobrem ao menos metade das habilidades
  const clusterable = profiles.filter((p) => p.values.filter((v) => v !== null).length >= categories.length / 2);
  const points = impute(clusterable.map((p) => p.values));
  const km = clusterable.length >= MIN_CLUSTER ? kmeans(points, k) : null;
  const sil = km ? silhouette(points, km.labels) : NaN;
  const proj = km ? pca2(points) : null;

  const calibration = calibrate(test, testForms);

  // tempo de resposta por pergunta (qualidade da pergunta e engajamento)
  const times = new Map<string, number[]>();
  for (const f of myForms)
    f.items.forEach((it, idx) => {
      const ms = f.answers[idx]?.elapsedMs;
      if (ms === undefined) return;
      times.set(it.questionId, [...(times.get(it.questionId) ?? []), ms]);
    });
  const qById = new Map(test.questions.map((q) => [q.id, q]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const timeRows = [...times]
    .map(([qid, ts]) => ({ q: qById.get(qid), med: median(ts), n: ts.length, fast: ts.filter((t) => t < FAST_MS).length / ts.length }))
    .filter((r) => r.q)
    .sort((a, b) => b.med - a.med);
  const allTimes = [...times.values()].flat();

  return (
    <div className="stack">
      <section>
        <h1 style={{ marginBottom: 6 }}>Análise</h1>
        <p className="muted" style={{ margin: 0 }}>
          Relações entre habilidades e grupos de perfis{user.role === "admin" ? "" : " dos seus pacientes"}. Visível só para a equipe: os grupos não são
          mostrados a pacientes e famílias, para evitar comparações.
        </p>
      </section>

      {tests.length > 1 && <nav className="tabs" style={{ margin: 0 }}>{tests.map((t) => tab(t.id === test.id, { teste: t.id }, t.name))}</nav>}
      <nav className="tabs" style={{ margin: 0 }}>
        {SERIES.map((s) => tab(s.key === serie, { serie: s.key }, s.label))}
      </nav>

      <div className="grid-3">
        <Stat label="Pacientes com dados" value={profiles.length} hint={`de ${patients.length} no teste`} />
        <Stat label="Respostas" value={myForms.reduce((a, f) => a + Object.keys(f.answers).length, 0)} hint={`${myForms.filter((f) => f.finishedAt).length} formulários concluídos`} />
        <Stat label="Tempo mediano" value={allTimes.length ? fmtSeconds(median(allTimes)) : "—"} hint="por pergunta" />
      </div>

      {profiles.length < IRT_STABLE_PERSONS && (
        <p className="card tight muted small" style={{ margin: 0 }}>
          Com {profiles.length} perfil(is), os números abaixo são exploratórios. A partir de ~{IRT_STABLE_PERSONS} pessoas os grupos e as correlações ficam
          mais claros.
        </p>
      )}

      <section className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Correlação entre habilidades</h2>
          <nav className="tabs" style={{ margin: 0 }}>
            {tab(metodo === "spearman", { metodo: "spearman" }, "Spearman")}
            {tab(metodo === "pearson", { metodo: "pearson" }, "Pearson")}
          </nav>
        </div>
        <p className="muted small">
          {metodo === "spearman"
            ? "Spearman (por postos): mede se as habilidades sobem e descem juntas, sem supor relação linear. Mais robusto com poucos dados."
            : "Pearson: mede relação linear entre os percentuais."}{" "}
          Cada pessoa é uma observação; células com menos de 5 pessoas ficam vazias.
        </p>
        <CorrHeatmap categories={categories} r={corr.r} n={corr.n} />
        {pairs.length > 0 && (
          <>
            <h3 style={{ marginTop: 20 }}>Relações mais fortes</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {pairs.slice(0, 6).map((x) => (
                <li key={`${x.a.id}${x.b.id}`}>
                  <strong>{shortName(x.a.name)}</strong> e <strong>{shortName(x.b.name)}</strong>: {x.r >= 0 ? "+" : ""}
                  {dec(x.r)} <span className="faint">({strength(x.r)}, n = {x.n})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card alt">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Grupos de perfis</h2>
          <nav className="tabs" style={{ margin: 0 }}>
            {[2, 3, 4, 5].map((n) => tab(n === k, { k: String(n) }, `${n} grupos`))}
          </nav>
        </div>
        {!km || !proj ? (
          <p className="muted small">
            São precisos ao menos {MIN_CLUSTER} pacientes com metade das habilidades respondidas nesta visão (hoje: {clusterable.length}).
          </p>
        ) : (
          <>
            <p className="muted small">
              k-means sobre os percentuais por habilidade; o mapa projeta os perfis nas duas direções que mais os diferenciam (PCA,{" "}
              {Math.round((proj.explained[0] + proj.explained[1]) * 100)}% da variação). Silhueta {Number.isFinite(sil) ? dec(sil) : "—"}{" "}
              <span className="faint">({silLabel(sil)})</span>. Pessoas próximas no mapa têm “pegadas” parecidas.
            </p>
            <Scatter coords={proj.coords} labels={km.labels} names={clusterable.map((p) => p.patient.name)} />
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Habilidade</th>
                    {km.centers.map((_, c) => (
                      <th key={c} style={{ textAlign: "right" }}>
                        <span style={{ color: SERIES_COLORS[c] }}>●</span> Grupo {c + 1} ({km.labels.filter((l) => l === c).length})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, j) => {
                    const overall = mean(points.map((p) => p[j]));
                    return (
                      <tr key={cat.id}>
                        <td>{cat.name}</td>
                        {km.centers.map((center, c) => {
                          const d = center[j] - overall;
                          return (
                            <td key={c} style={{ textAlign: "right" }}>
                              {Math.round(center[j])}%{" "}
                              <span className={Math.abs(d) >= 10 ? `pill ${d > 0 ? "high" : "low"}` : "faint"}>
                                {d >= 0 ? "+" : ""}
                                {Math.round(d)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="faint">Pacientes</td>
                    {km.centers.map((_, c) => (
                      <td key={c} style={{ textAlign: "right" }} className="small">
                        {clusterable
                          .filter((_, i) => km.labels[i] === c)
                          .map((p, i) => (
                            <span key={p.patient.id}>
                              {i > 0 && ", "}
                              <Link href={`/painel/pacientes/${p.patient.id}?aba=resultados`}>{p.patient.name.split(" ")[0]}</Link>
                            </span>
                          ))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Calibração TRI das perguntas</h2>
        <p className="muted small">
          Modelo de escala gradual (Rasch), calibrado com todas as aplicações do teste. <strong>Dificuldade (b)</strong>: acima de 0 = pergunta que pede
          mais da habilidade para ser marcada alto. <strong>Infit/outfit</strong>: perto de 1 é o ideal; acima de 1,3 a pergunta gera respostas
          erráticas (pode estar ambígua ou medir outra coisa); abaixo de 0,7 é redundante. <strong>Confiabilidade</strong>: o quanto a habilidade
          separa as pessoas (acima de 0,7 é bom).
        </p>
        {!calibration.size ? (
          <p className="faint">Ainda não há dados suficientes para calibrar (mínimo de 10 aplicações por habilidade).</p>
        ) : (
          categories
            .filter((c) => calibration.has(c.id))
            .map((c) => {
              const cal = calibration.get(c.id)!;
              const items = [...cal.items.values()].sort((a, b) => b.b - a.b);
              return (
                <details key={c.id} className="session">
                  <summary className="row spread">
                    <strong>{c.name}</strong>
                    <span className="small">
                      {cal.persons} aplicações · {items.length} perguntas · confiabilidade{" "}
                      <span className={`pill ${cal.reliability >= 0.7 ? "high" : cal.reliability >= 0.5 ? "mid" : "low"}`}>{dec(cal.reliability)}</span>
                      {items.some((i) => misfit(i.infit) || misfit(i.outfit)) && <span className="pill low">desajuste</span>}
                      {!cal.converged && <span className="pill mid">não convergiu</span>}
                    </span>
                  </summary>
                  <p className="faint">
                    Limiares da escala: {cal.tau.slice(1).map((t) => dec(t)).join(" · ")}
                    {cal.tau.slice(1).some((t, i, arr) => i > 0 && t < arr[i - 1]) && " · limiares fora de ordem: duas opções vizinhas não estão sendo diferenciadas"}
                  </p>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Pergunta</th>
                          <th style={{ textAlign: "right" }}>b</th>
                          <th style={{ textAlign: "right" }}>Infit</th>
                          <th style={{ textAlign: "right" }}>Outfit</th>
                          <th style={{ textAlign: "right" }}>n</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={i.questionId}>
                            <td className="small">{qById.get(i.questionId)?.text}</td>
                            <td style={{ textAlign: "right" }}>{dec(i.b)}</td>
                            <td style={{ textAlign: "right" }}>
                              <span className={misfit(i.infit) ? "pill low" : ""}>{dec(i.infit)}</span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <span className={misfit(i.outfit) ? "pill low" : ""}>{dec(i.outfit)}</span>
                            </td>
                            <td style={{ textAlign: "right" }} className="faint">
                              {i.n}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })
        )}
      </section>

      <section className="card alt">
        <h2>Tempo de resposta por pergunta</h2>
        <p className="muted small">
          Tempo com a tela visível até escolher a resposta. Mediana alta (acima de {fmtSeconds(SLOW_MS)}) pode indicar pergunta confusa; muitas respostas
          abaixo de {fmtSeconds(FAST_MS)} sugerem que a pergunta não está sendo lida.
        </p>
        {!timeRows.length ? (
          <p className="faint">Ainda não há tempos registrados (o tempo passou a ser medido nesta versão).</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pergunta</th>
                  <th style={{ textAlign: "right" }}>Mediana</th>
                  <th style={{ textAlign: "right" }}>Rápidas demais</th>
                  <th style={{ textAlign: "right" }}>n</th>
                </tr>
              </thead>
              <tbody>
                {timeRows.map((r) => (
                  <tr key={r.q!.id}>
                    <td className="small">
                      {r.q!.text}
                      <div className="faint">{catName.get(r.q!.categoryId)}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={r.med > SLOW_MS ? "pill mid" : ""}>{fmtSeconds(r.med)}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={r.fast >= 0.3 ? "pill low" : "faint"}>{Math.round(r.fast * 100)}%</span>
                    </td>
                    <td style={{ textAlign: "right" }} className="faint">
                      {r.n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const misfit = (v: number) => v > 1.3 || v < 0.7;

function strength(r: number) {
  const a = Math.abs(r);
  const s = a >= 0.7 ? "forte" : a >= 0.4 ? "moderada" : a >= 0.2 ? "fraca" : "desprezível";
  return `${s}${r < 0 ? ", inversa" : ""}`;
}

function silLabel(s: number) {
  if (!Number.isFinite(s)) return "sem dados";
  return s >= 0.5 ? "grupos bem separados" : s >= 0.25 ? "separação razoável" : "grupos pouco distintos";
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="card tight">
      <div className="faint">{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>{value}</div>
      <div className="faint">{hint}</div>
    </div>
  );
}

function CorrHeatmap({ categories, r, n }: { categories: Category[]; r: number[][]; n: number[][] }) {
  const bg = (v: number) =>
    !Number.isFinite(v) ? "transparent" : v >= 0 ? `rgba(61, 90, 128, ${Math.abs(v) * 0.85})` : `rgba(224, 122, 95, ${Math.abs(v) * 0.85})`;
  return (
    <div className="table-wrap">
      <table className="table heatmap">
        <thead>
          <tr>
            <th />
            {categories.map((c, j) => (
              <th key={c.id} title={c.name} style={{ textAlign: "center" }}>
                {j + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c.id}>
              <td className="small" style={{ whiteSpace: "nowrap" }}>
                <span className="faint">{i + 1}.</span> {shortName(c.name)}
              </td>
              {categories.map((d, j) => {
                const v = r[i][j];
                return (
                  <td
                    key={d.id}
                    title={`${c.name} × ${d.name}: ${Number.isFinite(v) ? dec(v) : "sem dados"} (n = ${n[i][j]})`}
                    style={{ background: i === j ? "rgba(47,58,74,0.06)" : bg(v), color: Math.abs(v) > 0.5 && i !== j ? "#fff" : undefined }}
                  >
                    {i === j ? "" : Number.isFinite(v) ? dec(v).replace("0,", ",") : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Scatter({ coords, labels, names }: { coords: number[][]; labels: number[]; names: string[] }) {
  const W = 640;
  const H = 340;
  const pad = 24;
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - pad * 2);
  const sy = (v: number) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", margin: "0 auto" }} role="img" aria-label="Mapa de perfis">
      <rect x={1} y={1} width={W - 2} height={H - 2} rx={14} fill="none" stroke="rgba(47,58,74,0.12)" />
      {coords.map((c, i) => (
        <g key={i}>
          <title>{`${names[i]} · grupo ${labels[i] + 1}`}</title>
          <circle cx={sx(c[0])} cy={sy(c[1])} r={8} fill={SERIES_COLORS[labels[i] % SERIES_COLORS.length]} fillOpacity={0.85} filter="url(#wc-symbol)" />
          <text x={sx(c[0]) + 11} y={sy(c[1])} dominantBaseline="middle" fontSize="11" fill="#5d6878" fontFamily="var(--font-body)">
            {names[i].split(" ")[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

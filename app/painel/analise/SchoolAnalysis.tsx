import Link from "next/link";
import { canSeePatient, type SessionUser } from "@/lib/auth";
import { IRT_STABLE_PERSONS } from "@/lib/irt";
import { scoreForms } from "@/lib/scoring";
import { correlationMatrix, dec, impute, kmeans, mean, median, pca2, silhouette, type CorrMethod } from "@/lib/stats";
import { fmtSeconds } from "@/lib/timing";
import { SERIES_COLORS, shortName } from "@/app/components/Radar";
import type { Db, Patient, School } from "@/lib/types";
import { CorrHeatmap, Scatter, silLabel, Stat, strength } from "./parts";

const SERIES = [
  { key: "paciente:si", label: "Paciente sobre si" },
  { key: "responsavel", label: "Mãe/pai" },
  { key: "terapeuta", label: "Terapeuta" },
  { key: "todas", label: "Todas as visões sobre o paciente" },
] as const;

/** Abaixo disso não há como separar grupos. */
const MIN_CLUSTER = 6;

export type AnalysisSearch = { teste?: string; serie?: string; metodo?: string; k?: string };

/**
 * Relações entre habilidades e grupos de perfis dos pacientes de uma escola, num dos testes que ela aplica.
 * O administrador da escola (e o dono) vê todos os pacientes; o terapeuta, só os próprios (canSeePatient).
 * `base` são os parâmetros que a página onde a análise aparece precisa manter nos links (ex.: a aba da escola).
 */
export function SchoolAnalysis({
  db,
  user,
  school,
  sp,
  path,
  base = {},
}: {
  db: Db;
  user: SessionUser;
  school: School;
  sp: AnalysisSearch;
  path: string;
  base?: Record<string, string>;
}) {
  const patientsOf = (testId: string) => db.patients.filter((p) => p.schoolId === school.id && p.testId === testId && canSeePatient(user, p));
  const tests = db.tests.filter((t) => school.testIds.includes(t.id) && !t.deletedAt);
  const answered = tests.filter((t) => {
    const ids = new Set(patientsOf(t.id).map((p) => p.id));
    return db.forms.some((f) => f.testId === t.id && ids.has(f.patientId) && Object.keys(f.answers).length);
  });
  const test = answered.find((t) => t.id === sp.teste) ?? answered[0];
  const serie = SERIES.find((s) => s.key === sp.serie)?.key ?? "paciente:si";
  const metodo: CorrMethod = sp.metodo === "pearson" ? "pearson" : "spearman";
  const k = Math.min(Math.max(Number(sp.k) || 3, 2), 5);
  const href = (q: AnalysisSearch) => `${path}?${new URLSearchParams({ ...base, teste: test?.id ?? "", serie, metodo, k: String(k), ...q })}`;
  const tab = (active: boolean, to: AnalysisSearch, label: string) => (
    <Link key={label} href={href(to)} className={`tab${active ? " active" : ""}`}>
      {label}
    </Link>
  );
  const scope = user.role === "terapeuta" ? "dos seus pacientes" : "dos pacientes da escola";

  if (!test) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Ainda não há respostas {scope}. A análise aparece quando os primeiros formulários forem respondidos.
        </p>
      </div>
    );
  }

  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const patients = patientsOf(test.id);
  const visibleIds = new Set(patients.map((p) => p.id));
  const myForms = db.forms.filter((f) => f.testId === test.id && visibleIds.has(f.patientId));

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
    categories.length,
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

  const allTimes = myForms.flatMap((f) => Object.values(f.answers).flatMap((a) => (a.elapsedMs === undefined ? [] : [a.elapsedMs])));

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Relações entre habilidades e grupos de perfis {scope}. Visível só para a equipe: os grupos não são mostrados a pacientes e famílias, para
        evitar comparações. A explicação de cada método está em <Link href="/painel/metodos">Métodos</Link>.
      </p>

      {answered.length > 1 && <nav className="tabs" style={{ margin: 0 }}>{answered.map((t) => tab(t.id === test.id, { teste: t.id }, t.name))}</nav>}
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
    </div>
  );
}

import { SERIES_COLORS, shortName } from "@/app/components/Radar";
import { dec } from "@/lib/stats";
import type { Category } from "@/lib/types";

export function strength(r: number) {
  const a = Math.abs(r);
  const s = a >= 0.7 ? "forte" : a >= 0.4 ? "moderada" : a >= 0.2 ? "fraca" : "desprezível";
  return `${s}${r < 0 ? ", inversa" : ""}`;
}

export function silLabel(s: number) {
  if (!Number.isFinite(s)) return "sem dados";
  return s >= 0.5 ? "grupos bem separados" : s >= 0.25 ? "separação razoável" : "grupos pouco distintos";
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="card tight">
      <div className="faint">{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>{value}</div>
      <div className="faint">{hint}</div>
    </div>
  );
}

export function CorrHeatmap({ categories, r, n }: { categories: Category[]; r: number[][]; n: number[][] }) {
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

export function Scatter({ coords, labels, names }: { coords: number[][]; labels: number[]; names: string[] }) {
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

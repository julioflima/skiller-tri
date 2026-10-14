import { SERIES_COLORS } from "./Radar";

/** Gráfico de linhas simples (0–100%) para a evolução por sessão. */
export function LineChart({
  xLabels,
  series,
}: {
  xLabels: string[];
  series: { label: string; color?: string; values: (number | null)[] }[];
}) {
  const W = 640;
  const H = 240;
  const pad = { l: 40, r: 16, t: 14, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (xLabels.length <= 1 ? iw / 2 : (i / (xLabels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 100) * ih;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Evolução por sessão">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(47,58,74,0.1)" strokeDasharray={v ? "3 4" : undefined} />
          <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#8e96a3">
            {v}%
          </text>
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#5d6878">
          {l}
        </text>
      ))}
      {series.map((s, si) => {
        const color = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length];
        const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
        // quebra a linha onde não há dado
        const segs: string[] = [];
        let cur = "";
        pts.forEach((p) => {
          if (!p) {
            if (cur) segs.push(cur);
            cur = "";
          } else cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
        });
        if (cur) segs.push(cur);
        return (
          <g key={s.label}>
            {segs.map((d, k) => (
              <path key={k} d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {pts.map((p, i) => (p ? <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={color} /> : null))}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="row" style={{ gap: 14, justifyContent: "center" }}>
      {items.map((it) => (
        <span key={it.label} className="small row" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: it.color, display: "inline-block" }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

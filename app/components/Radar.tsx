export const SERIES_COLORS = ["#5fa8d3", "#e07a5f", "#81b29a", "#9a8fc7", "#d9a441", "#d98fa6"];

/** Gráfico radar em SVG puro, com traço irregular de aquarela. */
export function Radar({
  labels,
  series,
  max,
  rings: ringCount,
  size = 420,
}: {
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  max: number;
  /** Quantidade de anéis de referência (padrão: um por unidade de `max`). */
  rings?: number;
  size?: number;
}) {
  const c = size / 2;
  const R = size / 2 - 40;
  const n = labels.length;
  const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, v: number) => [c + Math.cos(angle(i)) * (v / max) * R, c + Math.sin(angle(i)) * (v / max) * R];
  const nRings = ringCount ?? max;
  const rings = Array.from({ length: nRings }, (_, k) => ((k + 1) / nRings) * max);

  return (
    <svg viewBox={`-120 -6 ${size + 240} ${size + 12}`} width="100%" style={{ maxWidth: size + 240, display: "block", margin: "0 auto" }} role="img" aria-label="Perfil por habilidade">
      {rings.map((k) => (
        <polygon
          key={k}
          points={labels.map((_, i) => pt(i, k).join(",")).join(" ")}
          fill="none"
          stroke="rgba(47,58,74,0.12)"
          strokeDasharray={k === max ? undefined : "3 4"}
        />
      ))}
      {labels.map((_, i) => {
        const [x, y] = pt(i, max);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(47,58,74,0.1)" />;
      })}
      {series.map((s, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        const pts = s.values.map((v, i) => pt(i, v ?? 0).join(",")).join(" ");
        return (
          <g key={s.name}>
            <polygon points={pts} fill={color} fillOpacity={series.length > 1 ? 0.16 : 0.32} stroke={color} strokeWidth={2.5} filter="url(#wc-symbol)" />
            {s.values.map((v, i) => {
              if (v === null) return null;
              const [x, y] = pt(i, v);
              return <circle key={i} cx={x} cy={y} r={3.5} fill={color} />;
            })}
          </g>
        );
      })}
      {labels.map((label, i) => {
        const [x, y] = pt(i, max * 1.12);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize="13.5" fill="#5d6878" fontFamily="var(--font-body)">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export function shortName(name: string) {
  const first = name.split(/\s+e\s+|,/)[0];
  return first.length > 22 ? `${first.slice(0, 20)}…` : first;
}

import { band } from "@/lib/scoring";
import { Legend } from "./LineChart";

export type EcomapItem = { label: string; value: number | null; n?: number; hint?: string };

const TONE_COLOR: Record<string, string> = { high: "#81b29a", mid: "#d9a441", low: "#e07a5f", muted: "#b9bfc8" };

/**
 * Ecomapa de habilidades: a pessoa no centro e cada habilidade como um satélite.
 * Quanto mais perto do centro e mais grossa a ligação, mais desenvolvida a habilidade;
 * ligação tracejada = abaixo de 50%. Habilidades sem dados ficam cinzas na órbita externa.
 */
export function Ecomap({ center, items, size = 520, compact = false }: { center: string; items: EcomapItem[]; size?: number; compact?: boolean }) {
  const c = size / 2;
  const minR = size * 0.2;
  const maxR = size * 0.4;
  const n = items.length;
  const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const orbit = (v: number | null) => (v === null ? maxR + size * 0.03 : minR + (1 - v / 100) * (maxR - minR));
  const satR = compact ? size * 0.035 : size * 0.042;
  const first = center.split(" ")[0];
  const pad = compact ? 10 : 70;

  return (
    <>
      <svg
        viewBox={`${-pad} ${-pad / 3} ${size + pad * 2} ${size + (pad / 3) * 2}`}
        width="100%"
        style={{ maxWidth: size + pad * 2, display: "block", margin: "0 auto" }}
        role="img"
        aria-label={`Ecomapa de habilidades de ${first}`}
      >
        {[100, 75, 50, 25].map((v) => (
          <circle key={v} cx={c} cy={c} r={orbit(v)} fill="none" stroke="rgba(47,58,74,0.1)" strokeDasharray={v === 50 ? undefined : "3 5"} />
        ))}
        {items.map((it, i) => {
          const r = orbit(it.value);
          const x = c + Math.cos(angle(i)) * r;
          const y = c + Math.sin(angle(i)) * r;
          const tone = band(it.value).tone;
          const color = TONE_COLOR[tone];
          const width = it.value === null ? 1 : 1 + (it.value / 100) * (compact ? 4 : 6);
          return (
            <line
              key={`l${i}`}
              x1={c}
              y1={c}
              x2={x}
              y2={y}
              stroke={color}
              strokeOpacity={0.75}
              strokeWidth={width}
              strokeLinecap="round"
              strokeDasharray={it.value === null ? "1 5" : it.value < 50 ? "7 5" : undefined}
            />
          );
        })}

        <circle cx={c} cy={c} r={size * 0.085} fill="#3d5a80" fillOpacity={0.88} filter="url(#wc-symbol)" />
        <text x={c} y={c} textAnchor="middle" dominantBaseline="central" fontSize={compact ? 13 : 17} fill="#fff" fontFamily="var(--font-display)">
          {first.length > 11 ? `${first.slice(0, 10)}…` : first}
        </text>

        {items.map((it, i) => {
          const r = orbit(it.value);
          const a = angle(i);
          const x = c + Math.cos(a) * r;
          const y = c + Math.sin(a) * r;
          const tone = band(it.value).tone;
          const cos = Math.cos(a);
          const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
          const lx = x + Math.cos(a) * (satR + 6);
          const ly = y + Math.sin(a) * (satR + 6) + (Math.abs(cos) < 0.25 ? Math.sign(Math.sin(a)) * 6 : 0);
          return (
            <g key={`s${i}`}>
              <title>
                {`${it.label}: ${it.value === null ? "sem dados" : `${Math.round(it.value)}% · ${band(it.value).label}`}${it.n ? ` · ${it.n} resposta(s)` : ""}${it.hint ? ` · ${it.hint}` : ""}`}
              </title>
              <circle cx={x} cy={y} r={satR} fill={TONE_COLOR[tone]} fillOpacity={it.value === null ? 0.35 : 0.9} filter="url(#wc-symbol)" />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={compact ? 9.5 : 12}
                fontWeight={700}
                fill="#fff"
                fontFamily="var(--font-body)"
              >
                {it.value === null ? "–" : Math.round(it.value)}
              </text>
              {!compact && (
                <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="12.5" fill="#5d6878" fontFamily="var(--font-body)">
                  {it.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!compact && (
        <Legend
          items={[
            { label: "consolidada (75%+)", color: TONE_COLOR.high },
            { label: "em desenvolvimento", color: TONE_COLOR.mid },
            { label: "inicial (abaixo de 50%)", color: TONE_COLOR.low },
            { label: "sem dados", color: TONE_COLOR.muted },
          ]}
        />
      )}
    </>
  );
}

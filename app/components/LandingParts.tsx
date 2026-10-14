// peças visuais compartilhadas pelas landings (plataforma e testes); estilos em app/landing.css

// paleta das landings (definida em landing.css)
export const LP_COLORS = ["var(--k-orange)", "var(--k-teal)", "var(--k-purple)", "var(--k-yellow)", "var(--k-green)", "var(--k-navy)"];

/** Ecomapa ilustrativo: a pessoa no centro e uma bolinha por classificação; distâncias fixas, só de exemplo. */
export function DemoEcomap({ count, center = "eu" }: { count: number; center?: string }) {
  const c = 200;
  const n = Math.max(count, 1);
  return (
    <svg viewBox="0 0 400 400" className="lp-ecomap" role="img" aria-label={`Exemplo ilustrativo de ecomapa com ${count} classificações`}>
      {[60, 110, 160].map((r) => (
        <circle key={r} cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeDasharray="3 6" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        // distância pseudoaleatória estável, entre 0,35 e 0,95
        const d = 0.35 + (((i * 37 + 11) % 13) / 12) * 0.6;
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = 40 + d * 130;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const color = LP_COLORS[i % LP_COLORS.length];
        return (
          <g key={i}>
            <line x1={c} y1={c} x2={x} y2={y} stroke={color} strokeWidth={2.2 - d * 1.4} opacity={0.55} />
            <circle cx={x} cy={y} r={n > 16 ? 11 : 15} fill={color} opacity={0.92} />
            <text x={x} y={y + 4.5} textAnchor="middle" className="lp-ecomap-n">
              {i + 1}
            </text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r={30} fill="var(--k-navy)" />
      <text x={c} y={c + 5} textAnchor="middle" className="lp-ecomap-me">
        {center}
      </text>
    </svg>
  );
}

/** Assinatura visual: quatro pontos coloridos. */
export function Dots() {
  return (
    <span className="lp-dots" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export { BrandMark as PlatformWordmark } from "./BrandMark";

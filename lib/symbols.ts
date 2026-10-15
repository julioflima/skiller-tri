/** Paleta de aquarela do símbolo automático. */
export const PALETTE = [
  "#3d5a80", // índigo
  "#e07a5f", // terracota
  "#81b29a", // sálvia
  "#f2cc8f", // ocre
  "#9a8fc7", // lilás
  "#5fa8d3", // céu
  "#d98fa6", // rosa
  "#6b9080", // musgo
];

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Símbolo automático da resposta de posição `index` numa escala de `total` respostas,
 * para escalas maiores que DEFAULT_SYMBOLS:
 * um círculo de aquarela que vai enchendo, para a gradação ficar visível num relance.
 */
export function autoOptionSymbol(index: number, total: number): string {
  const p = total > 1 ? index / (total - 1) : 1;
  const color = PALETTE[index % PALETTE.length];
  const R = 36;
  const parts = [`<circle cx="50" cy="50" r="${R}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="4" stroke-opacity="0.8"/>`];
  if (p >= 1) {
    parts.push(`<circle cx="50" cy="50" r="${R - 5}" fill="${color}" fill-opacity="0.8"/>`);
  } else if (p > 0) {
    // nível da "água" dentro do círculo interno
    const r = R - 5;
    const y = 50 + r - 2 * r * p;
    const hw = Math.sqrt(r * r - (y - 50) ** 2);
    parts.push(`<path d="M${r1(50 - hw)},${r1(y)} A${r},${r} 0 ${y < 50 ? 1 : 0} 0 ${r1(50 + hw)},${r1(y)} Z" fill="${color}" fill-opacity="0.8"/>`);
  } else {
    parts.push(`<circle cx="50" cy="50" r="5" fill="${color}" fill-opacity="0.7"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parts.join("")}</svg>`;
}

/**
 * Símbolos padrão das respostas: a família desenhada pela IA para a escala de concordância do Teste DEMO
 * (copo que vai enchendo, do vazio ao cheio), da primeira à última resposta.
 */
export const DEFAULT_SYMBOLS = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="#5fa8d3" stroke-opacity="0.7" stroke-width="4"/><circle cx="50" cy="50" r="34" fill="#5fa8d3" fill-opacity="0.45"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="#5fa8d3" stroke-opacity="0.7" stroke-width="4"/><path d="M16 50 A34 34 0 0 0 84 50 Z" fill="#5fa8d3" fill-opacity="0.45"/><path d="M16 50 A34 34 0 0 0 84 50 Z" fill="#3d5a80" fill-opacity="0.6" transform="translate(0 0) scale(1 0.01) translate(0 4950)"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="#5fa8d3" stroke-opacity="0.7" stroke-width="4"/><path d="M16 50 A34 34 0 0 0 84 50 Z" fill="#5fa8d3" fill-opacity="0.75"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="#5fa8d3" stroke-opacity="0.7" stroke-width="4"/><path d="M17 38 A34 34 0 0 0 83 38 A34 34 0 0 1 17 38 Z" fill="#5fa8d3" fill-opacity="0.45"/><path d="M16.5 40 L83.5 40 A34 34 0 0 1 50 84 A34 34 0 0 1 16.5 40 Z" fill="#5fa8d3" fill-opacity="0.75"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="#5fa8d3" fill-opacity="0.85"/><circle cx="50" cy="50" r="34" fill="none" stroke="#3d5a80" stroke-opacity="0.8" stroke-width="4"/></svg>`,
];

/**
 * Símbolo padrão da resposta de posição `index` numa escala de `total` respostas.
 * Até 5 respostas, usa DEFAULT_SYMBOLS espalhados do primeiro ao último; acima disso eles se repetiriam,
 * então cai no gerador automático, que gradua qualquer quantidade.
 */
export function defaultOptionSymbol(index: number, total: number): string {
  if (total > DEFAULT_SYMBOLS.length) return autoOptionSymbol(index, total);
  const last = DEFAULT_SYMBOLS.length - 1;
  return DEFAULT_SYMBOLS[total > 1 ? Math.round((index * last) / (total - 1)) : last];
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

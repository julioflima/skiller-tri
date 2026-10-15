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
 * usado enquanto a resposta não tem imagem enviada:
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

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

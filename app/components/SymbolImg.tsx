import { autoOptionSymbol, svgDataUri } from "@/lib/symbols";
import type { Scale } from "@/lib/types";

/** Símbolo da resposta: a imagem enviada, o SVG antigo salvo, ou o automático pela posição na escala. */
export function optionSymbolSrc(scale: Pick<Scale, "options">, optionId: string) {
  const i = scale.options.findIndex((o) => o.id === optionId);
  const o = scale.options[i];
  if (!o) return "";
  if (o.symbolImage) return o.symbolImage;
  return svgDataUri(o.symbolSvg || autoOptionSymbol(i, scale.options.length));
}

/** Renderiza o SVG como <img>: scripts nunca executam dentro de uma imagem. */
export function SymbolImg({ src, size = 64, label }: { src: string; size?: number; label?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="symbol" src={src} width={size} height={size} alt={label ?? "símbolo"} />
  );
}

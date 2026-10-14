import { autoSymbol, svgDataUri } from "@/lib/symbols";
import type { Question } from "@/lib/types";

export function symbolSrc(q: Pick<Question, "id" | "symbolSvg">) {
  return svgDataUri(q.symbolSvg || autoSymbol(q.id));
}

/** Renderiza o SVG como <img>: scripts nunca executam dentro de uma imagem. */
export function SymbolImg({ src, size = 64, label }: { src: string; size?: number; label?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="symbol" src={src} width={size} height={size} alt={label ?? "símbolo"} />
  );
}

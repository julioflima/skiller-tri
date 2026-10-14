import "server-only";
import { del, put } from "@vercel/blob";
import { cleanSvg } from "./symbols";

/**
 * true quando o Vercel Blob está ligado ao projeto: via OIDC (BLOB_STORE_ID, criado pelo Storage da Vercel,
 * com o VERCEL_OIDC_TOKEN que a Vercel injeta) ou via token clássico (BLOB_READ_WRITE_TOKEN).
 */
export const symbolStorageEnabled = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Salva o SVG de um símbolo no Vercel Blob e devolve a URL pública.
 * O SVG passa por cleanSvg() antes do upload, e o caminho leva sufixo aleatório,
 * então cada nova versão ganha uma URL própria e o cache da CDN nunca serve a anterior.
 */
export async function saveSymbol(questionId: string, svg: string): Promise<string> {
  const blob = await put(`symbols/${questionId}.svg`, cleanSvg(svg), {
    access: "public",
    contentType: "image/svg+xml",
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

/** Remove um símbolo antigo do Blob (ignora URLs que não são do Blob, como data: URIs). */
export async function deleteSymbol(url: string | undefined) {
  if (!url || !url.includes(".blob.vercel-storage.com/")) return;
  await del(url);
}

import "server-only";
import { del, put } from "@vercel/blob";
import { symbolStorageEnabled } from "./symbol-storage";

/** Prefixo das rotas que servem arquivos do Blob (privado) pelo app: /arquivos/<caminho no Blob>. */
export const FILES_ROUTE = "/arquivos/";

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Pasta das imagens da landing de um teste no Blob. */
export const landingFolder = (testId: string) => `testes/${testId}/landing/`;

/**
 * Envia uma imagem da landing (logo ou destaque) para a pasta do teste e devolve o endereço servido pelo app.
 * O nome leva sufixo aleatório: cada envio ganha um endereço novo e a CDN nunca serve a versão anterior.
 */
export async function saveLandingImage(testId: string, kind: "logo" | "destaque", file: File): Promise<string> {
  if (!symbolStorageEnabled()) throw new Error("O armazenamento de arquivos (Vercel Blob) não está configurado.");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Envie uma imagem PNG, JPG, WEBP ou SVG.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("A imagem passa de 3 MB.");
  const blob = await put(`${landingFolder(testId)}${kind}.${ext}`, file, { access: "private", contentType: file.type, addRandomSuffix: true });
  return `${FILES_ROUTE}${blob.pathname}`;
}

/** Apaga do Blob uma imagem que saiu da landing (ignora caminhos antigos de /public, como /brand/...). */
export async function deleteLandingImage(url: string | undefined) {
  if (!url?.startsWith(FILES_ROUTE)) return;
  await del(url.slice(FILES_ROUTE.length)).catch(() => undefined);
}

import { get } from "@vercel/blob";

/**
 * Serve arquivos do Blob (store privado) usados em páginas públicas, como as imagens das landings.
 * Só a pasta testes/ é exposta; o nome de cada arquivo tem sufixo aleatório, então o cache pode ser longo.
 */
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathname = path.map(decodeURIComponent).join("/");
  if (!pathname.startsWith("testes/") || pathname.includes("..")) return new Response("Não encontrado", { status: 404 });
  const res = await get(pathname, { access: "private" }).catch(() => null);
  if (!res || res.statusCode !== 200) return new Response("Não encontrado", { status: 404 });
  return new Response(res.stream, {
    headers: {
      "Content-Type": res.blob.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // um SVG aberto direto no navegador não roda scripts
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import Anthropic from "@anthropic-ai/sdk";

/** Paleta de aquarela usada tanto pelo gerador automático quanto pela IA. */
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

export const DEFAULT_SYMBOL_PROMPT = `Você desenha os símbolos das respostas de um questionário psicológico respondido por adolescentes.
Cada resposta da escala (ex.: "Nunca", "Às vezes", "Sempre") ganha um símbolo, e a pessoa toca no símbolo para responder.
O objetivo é que ela reconheça cada resposta num relance, responda mais rápido e se envolva com o questionário.

Regras obrigatórias:
- Os símbolos de uma escala formam uma família: o mesmo objeto ou motivo visual, variando em quantidade ou intensidade
  na ordem das respostas (ex.: copo vazio → cheio, lua nova → cheia, um ponto → muitos pontos, broto → árvore).
- A diferença entre respostas vizinhas precisa ser evidente mesmo em tamanho pequeno (64 px).
- Formas simples e grandes, com poucos detalhes; pode ser figurativo, desde que o motivo seja neutro.
- Sem julgamento de valor: nada de rostos sorrindo ou tristes, polegares, sinais de certo/errado, verde = bom / vermelho = ruim,
  troféus ou alertas. A resposta "mais intensa" não é melhor nem pior que as outras.
- Sem letras, números ou texto.
- Estilo aquarela: formas suaves, sobreposição com transparência (fill-opacity entre 0.45 e 0.85).`;

/** Instruções de símbolo do teste, ou as padrão. */
export const symbolPromptFor = (test: { symbolPrompt?: string }) => test.symbolPrompt?.trim() || DEFAULT_SYMBOL_PROMPT;

const SVG_RULES = `Formato da resposta: apenas um elemento <svg> completo, sem explicações.
- xmlns="http://www.w3.org/2000/svg" e viewBox="0 0 100 100", sem width/height.
- Use somente: g, path, circle, ellipse, rect, polygon, polyline, line, defs, radialGradient, linearGradient, stop.
- Sem <text>, <image>, <script>, <style>, <foreignObject>, filtros, atributos on* ou links externos.
- No máximo 12 elementos de desenho. Fundo transparente.`;

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Símbolo automático da resposta de posição `index` numa escala de `total` respostas:
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

const FORBIDDEN = /<\s*(script|style|text|textPath|image|foreignObject|use|a|iframe|animate|set)\b|\son\w+\s*=|javascript:|href\s*=|url\(\s*['"]?(?!#)/i;

/** Extrai e valida o SVG devolvido pela IA. Lança erro se algo for suspeito. */
export function cleanSvg(raw: string): string {
  const match = raw.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) throw new Error("A resposta não contém um <svg>.");
  const svg = match[0].trim();
  if (svg.length > 20000) throw new Error("SVG grande demais.");
  if (FORBIDDEN.test(svg)) throw new Error("SVG contém elementos não permitidos.");
  if (!/viewBox="0 0 100 100"/.test(svg)) throw new Error("SVG sem viewBox 0 0 100 100.");
  return svg;
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Credenciais da IA, lidas só das variáveis de ambiente do servidor. O modelo fica em cada chamada. */
export function aiConfig() {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    workspaceId: process.env.ANTHROPIC_WORKSPACE_ID || undefined,
  };
}

/** Traduz erros da API para uma mensagem curta em português. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return "Chave da API inválida.";
    if (e.status === 429) return "Limite de uso da API atingido. Tente novamente em instantes.";
    const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message;
    if (detail?.includes("anthropic-workspace-id")) {
      return "Esta chave não está vinculada a um workspace: defina ANTHROPIC_WORKSPACE_ID no servidor (ou use uma chave de workspace).";
    }
    return `Erro da API (${e.status ?? "sem status"}): ${detail ?? e.message}`;
  }
  return e instanceof Error ? e.message : "Erro inesperado ao gerar o símbolo.";
}

/** Gera de uma vez os símbolos de todas as respostas de uma escala, na mesma ordem, para saírem como uma família. */
export async function generateScaleSymbolsWithAI(opts: {
  apiKey: string;
  workspaceId?: string;
  model: string;
  instructions: string;
  scaleName: string;
  options: { label: string; description: string }[];
}): Promise<string[]> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    // Chaves sem workspace fixo exigem o cabeçalho anthropic-workspace-id
    defaultHeaders: opts.workspaceId ? { "anthropic-workspace-id": opts.workspaceId } : undefined,
  });
  const n = opts.options.length;

  const response = await client.beta.messages.create({
    model: opts.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `${opts.instructions}\n\n${SVG_RULES}\n\nResponda com exatamente ${n} elementos <svg>, um por resposta, na ordem dada, e nada além deles.`,
    messages: [
      {
        role: "user",
        content:
          `Escala: "${opts.scaleName}"\nRespostas, em ordem:\n` +
          opts.options.map((o, i) => `${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`).join("\n") +
          `\nCores sugeridas: ${PALETTE.join(", ")}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("A IA recusou gerar estes símbolos.");
  if (response.stop_reason === "max_tokens") throw new Error("A resposta da IA foi cortada.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const svgs = text.match(/<svg[\s\S]*?<\/svg>/gi) ?? [];
  if (svgs.length !== n) throw new Error(`A IA devolveu ${svgs.length} símbolos para ${n} respostas. Tente de novo.`);
  return svgs.map(cleanSvg);
}

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

export const DEFAULT_SYMBOL_PROMPT = `Você desenha símbolos abstratos que identificam itens de um questionário psicológico.
O símbolo serve apenas para a pessoa reconhecer e diferenciar o item — ele NÃO pode induzir a resposta.

Regras obrigatórias:
- Composição abstrata e geométrica/orgânica (formas, manchas, linhas, pontos). Nada figurativo.
- Sem rostos, pessoas, mãos, corações, setas, sinais de certo/errado, emojis, letras, números ou texto.
- Sem carga emocional positiva ou negativa: evite sorrisos, lágrimas, raios, alvos, troféus, cores de alerta.
- Não ilustre o conteúdo da afirmação; o símbolo deve ser neutro em relação a ela.
- Estilo aquarela: formas suaves, sobreposição com transparência (fill-opacity entre 0.45 e 0.85).`;

const SVG_RULES = `Formato da resposta: apenas um elemento <svg> completo, sem explicações.
- xmlns="http://www.w3.org/2000/svg" e viewBox="0 0 100 100", sem width/height.
- Use somente: g, path, circle, ellipse, rect, polygon, polyline, line, defs, radialGradient, linearGradient, stop.
- Sem <text>, <image>, <script>, <style>, <foreignObject>, filtros, atributos on* ou links externos.
- No máximo 12 elementos de desenho. Fundo transparente.`;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Símbolo determinístico usado quando ainda não há um gerado pela IA. */
export function autoSymbol(seedText: string): string {
  const rand = rng(hash(seedText));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const colors = [...PALETTE].sort(() => rand() - 0.5).slice(0, 3);
  const parts: string[] = [];

  // mancha de fundo
  const blobPts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const rad = 30 + rand() * 12;
    return [50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad];
  });
  const d =
    `M${r1(blobPts[0][0])},${r1(blobPts[0][1])} ` +
    blobPts
      .map((p, i) => {
        const n = blobPts[(i + 1) % blobPts.length];
        return `Q${r1(p[0])},${r1(p[1])} ${r1((p[0] + n[0]) / 2)},${r1((p[1] + n[1]) / 2)}`;
      })
      .join(" ") +
    "Z";
  parts.push(`<path d="${d}" fill="${colors[0]}" fill-opacity="0.45"/>`);

  const shapes = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < shapes; i++) {
    const kind = pick(["circle", "ring", "poly", "arc", "dots", "wave"]);
    const cx = r1(32 + rand() * 36);
    const cy = r1(32 + rand() * 36);
    const c = colors[(i + 1) % colors.length];
    const size = 8 + rand() * 14;
    if (kind === "circle") {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r1(size)}" fill="${c}" fill-opacity="0.7"/>`);
    } else if (kind === "ring") {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r1(size)}" fill="none" stroke="${c}" stroke-width="4" stroke-opacity="0.8"/>`);
    } else if (kind === "poly") {
      const sides = 3 + Math.floor(rand() * 4);
      const rot = rand() * Math.PI;
      const pts = Array.from({ length: sides }, (_, k) => {
        const a = rot + (k / sides) * Math.PI * 2;
        return `${r1(cx + Math.cos(a) * size)},${r1(cy + Math.sin(a) * size)}`;
      }).join(" ");
      parts.push(`<polygon points="${pts}" fill="${c}" fill-opacity="0.65"/>`);
    } else if (kind === "arc") {
      const a0 = rand() * Math.PI * 2;
      const a1 = a0 + Math.PI * (0.6 + rand() * 0.8);
      const R = size + 6;
      parts.push(
        `<path d="M${r1(50 + Math.cos(a0) * R)},${r1(50 + Math.sin(a0) * R)} A${r1(R)},${r1(R)} 0 0 1 ${r1(50 + Math.cos(a1) * R)},${r1(50 + Math.sin(a1) * R)}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-opacity="0.8"/>`,
      );
    } else if (kind === "dots") {
      const n = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        parts.push(`<circle cx="${r1(25 + rand() * 50)}" cy="${r1(25 + rand() * 50)}" r="${r1(2.5 + rand() * 3)}" fill="${c}" fill-opacity="0.85"/>`);
      }
    } else {
      const y = cy;
      parts.push(
        `<path d="M22,${y} C36,${r1(y - size)} 44,${r1(y + size)} 58,${y} S78,${r1(y - size)} 80,${y}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-opacity="0.8"/>`,
      );
    }
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

/** Credenciais da IA: as cadastradas no admin têm prioridade sobre as variáveis de ambiente. */
export function aiCredentials(settings: { anthropicApiKey?: string; anthropicWorkspaceId?: string }) {
  return {
    apiKey: settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
    workspaceId: settings.anthropicWorkspaceId || process.env.ANTHROPIC_WORKSPACE_ID || undefined,
  };
}

/** Traduz erros da API para uma mensagem curta em português. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return "Chave da API inválida.";
    if (e.status === 429) return "Limite de uso da API atingido. Tente novamente em instantes.";
    const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message;
    if (detail?.includes("anthropic-workspace-id")) {
      return "Esta chave não está vinculada a um workspace: informe o ID do workspace em Configurações (ou use uma chave de workspace).";
    }
    return `Erro da API (${e.status ?? "sem status"}): ${detail ?? e.message}`;
  }
  return e instanceof Error ? e.message : "Erro inesperado ao gerar o símbolo.";
}

export async function generateSymbolWithAI(opts: {
  apiKey: string;
  workspaceId?: string;
  model: string;
  instructions: string;
  questionText: string;
  avoid: string[];
}): Promise<string> {
  // Chaves sem workspace fixo exigem o cabeçalho anthropic-workspace-id
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({
    apiKey: opts.apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
  const colors = [...PALETTE].sort(() => Math.random() - 0.5).slice(0, 3);
  const motif = ["círculos sobrepostos", "manchas orgânicas", "linhas curvas", "polígonos irregulares", "pontos e traços", "faixas onduladas", "anéis concêntricos"][
    Math.floor(Math.random() * 7)
  ];

  const response = await client.beta.messages.create({
    model: opts.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `${opts.instructions}\n\n${SVG_RULES}`,
    messages: [
      {
        role: "user",
        content:
          `Crie o símbolo para o item abaixo. Ele precisa ser visualmente distinto dos demais itens do questionário.\n\n` +
          `Item: "${opts.questionText}"\n` +
          `Cores sugeridas: ${colors.join(", ")}\n` +
          `Motivo sugerido para variar: ${motif}\n` +
          (opts.avoid.length ? `Evite repetir composições parecidas com estas já usadas: ${opts.avoid.slice(0, 15).join("; ")}\n` : ""),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("A IA recusou gerar este símbolo.");
  if (response.stop_reason === "max_tokens") throw new Error("A resposta da IA foi cortada.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return cleanSvg(text);
}

/** Resumo curto da composição de um SVG, usado para pedir variedade à IA. */
export function describeSvg(svg: string) {
  const counts: Record<string, number> = {};
  for (const m of svg.matchAll(/<(path|circle|ellipse|rect|polygon|polyline|line)\b/g)) {
    counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  const fills = [...new Set([...svg.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase()))].slice(0, 3);
  return `${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")} (${fills.join(" ")})`;
}

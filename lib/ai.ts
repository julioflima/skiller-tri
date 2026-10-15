import Anthropic from "@anthropic-ai/sdk";

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
  return e instanceof Error ? e.message : "Erro inesperado da IA.";
}

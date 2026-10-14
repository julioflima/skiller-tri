import { revalidatePath } from "next/cache";

export type Result<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

/** Executa uma ação de servidor devolvendo erro amigável em vez de lançar exceção para o cliente. */
export async function guard<T = unknown>(fn: () => Promise<string | void | { message?: string; data?: T }>): Promise<Result<T>> {
  try {
    const out = await fn();
    revalidatePath("/", "layout");
    if (typeof out === "string") return { ok: true, message: out };
    return { ok: true, ...(out ?? {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
  }
}

export function fail(message: string): never {
  throw new Error(message);
}

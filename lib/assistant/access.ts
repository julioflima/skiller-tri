import type { SessionUser } from "../auth";

/**
 * Quem vê o log de Lacunas: só os ids de LACUNAS_USER_IDS (separados por vírgula), hoje só o Julio.
 * Para os demais a aba, a página e qualquer menção ao log não existem.
 */
export function seesGaps(user: Pick<SessionUser, "id" | "role">) {
  const ids = (process.env.LACUNAS_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return user.role === "admin" && ids.includes(user.id);
}

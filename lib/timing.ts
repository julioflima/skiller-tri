/** Abaixo disso a pessoa provavelmente não leu a pergunta inteira. */
export const FAST_MS = 1500;
/** Acima disso a pergunta pode estar confusa (ou a pessoa se distraiu). */
export const SLOW_MS = 30000;

export function fmtSeconds(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  return s < 60 ? `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function timeTone(ms: number | undefined) {
  if (ms === undefined) return "";
  return ms < FAST_MS ? "low" : ms > SLOW_MS ? "mid" : "";
}

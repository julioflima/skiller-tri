"use client";

import { useState, useTransition } from "react";
import { setGapStatus } from "../assistant-actions";

type Status = "aberta" | "resolvida" | "ignorada";

/** Muda a situação de uma lacuna (nada é apagado: resolvidas e ignoradas continuam no log). */
export function GapStatus({ id, status, note }: { id: string; status: Status; note: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const set = (next: Status) =>
    start(async () => {
      const text = next === "resolvida" ? window.prompt("Nota (opcional): o que foi feito?", note) : undefined;
      if (text === null) return;
      const r = await setGapStatus(id, next, text);
      setError(r.ok ? "" : r.error);
    });
  return (
    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
      {status !== "resolvida" && (
        <button type="button" className="btn sage sm" disabled={pending} onClick={() => set("resolvida")}>
          Resolvida
        </button>
      )}
      {status === "aberta" ? (
        <button type="button" className="btn ghost sm" disabled={pending} onClick={() => set("ignorada")}>
          Ignorar
        </button>
      ) : (
        <button type="button" className="btn ghost sm" disabled={pending} onClick={() => set("aberta")}>
          Reabrir
        </button>
      )}
      {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

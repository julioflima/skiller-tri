"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import { changeOwnPassword } from "../user-actions";

export function PasswordForm() {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  return (
    <form
      className="card alt stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.next !== f.confirm) return toast.show("A confirmação não confere com a nova senha.");
        start(async () => {
          const res = await changeOwnPassword(f.current, f.next);
          toast.show(res.ok ? res.message ?? "Senha alterada." : res.error);
          if (res.ok) setF({ current: "", next: "", confirm: "" });
        });
      }}
    >
      {toast.node}
      <h2 style={{ margin: 0 }}>Trocar senha</h2>
      <div className="grid-2" style={{ gap: 14 }}>
        <div>
          <label htmlFor="pw-cur">Senha atual</label>
          <input id="pw-cur" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
        </div>
        <div>
          <label htmlFor="pw-new">Nova senha</label>
          <input id="pw-new" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required minLength={8} />
        </div>
        <div>
          <label htmlFor="pw-conf">Confirmar nova senha</label>
          <input id="pw-conf" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
        </div>
      </div>
      <div>
        <button className="btn" disabled={pending}>
          {pending ? "Salvando…" : "Trocar senha"}
        </button>
      </div>
    </form>
  );
}

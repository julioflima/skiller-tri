"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  // controlado: o React limpa os campos não controlados a cada envio, e o e-mail deve sobreviver a um erro
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="stack">
      <h2 style={{ marginBottom: 0 }}>Entrar</h2>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn warm" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

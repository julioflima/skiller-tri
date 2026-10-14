"use client";

import { useActionState, useState } from "react";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { acceptInvite } from "../actions";

export function AcceptInviteForm({
  token,
  email,
  name,
  role,
  school,
}: {
  token: string;
  email: string;
  name: string;
  role: Role;
  school?: string;
}) {
  const [state, action, pending] = useActionState(acceptInvite, { error: "" });
  // controlados: o React limpa os campos não controlados a cada envio, e eles devem sobreviver a um erro
  const [typedEmail, setTypedEmail] = useState("");
  const [typedName, setTypedName] = useState(name);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="token" value={token} />
      <div>
        <h2 style={{ marginBottom: 4 }}>Criar sua conta</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {role === "admin" ? "Você foi convidado como dono da plataforma." : `Você foi convidado como ${ROLE_LABEL[role]}${school ? ` da escola ${school}` : ""}.`}
        </p>
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        {email ? (
          <input id="email" type="email" value={email} readOnly autoComplete="username" />
        ) : (
          <input id="email" name="email" type="email" autoComplete="username" required value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} />
        )}
      </div>
      <div className="field">
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} autoComplete="name" required autoFocus={!!email && !name} />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus={!!email && !!name} />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirme a senha</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn warm" disabled={pending}>
        {pending ? "Criando…" : "Criar conta e entrar"}
      </button>
    </form>
  );
}

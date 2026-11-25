"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { Result } from "@/lib/result";
import { ROLE_LABEL, type Role, type SchoolRole } from "@/lib/roles";
import { resetUserPassword, updateUser } from "../user-actions";

export type Member = { id: string; name: string; email: string; role: Role; active: boolean; patients: number };

/** Papel dentro da escola: terapeuta (responde e analisa) ou administrador da escola (pacientes, equipe, links). */
export function SchoolRoleSelect({ value, onChange, disabled }: { value: SchoolRole; onChange: (role: SchoolRole) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as SchoolRole)} disabled={disabled} aria-label="Papel" style={{ flex: 1, minWidth: 170 }}>
      <option value="terapeuta">Terapeuta</option>
      <option value="gestor">Administrador da escola</option>
    </select>
  );
}

function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.show(res.error);
      toast.show(res.message ?? "Feito.");
      onOk?.();
      router.refresh();
    });
  return { run, pending, toast };
}

export function MembersTable({ members, meId, title = "Equipe" }: { members: Member[]; meId: string; title?: string }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {members.length === 0 && <p className="muted" style={{ margin: 0 }}>Ninguém cadastrado ainda.</p>}
      <div className="stack">
        {members.map((m) => (
          <MemberRow key={m.id} m={m} isMe={m.id === meId} />
        ))}
      </div>
    </section>
  );
}

function MemberRow({ m, isMe }: { m: Member; isMe: boolean }) {
  const { run, pending, toast } = useRunner();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: m.name, email: m.email, role: m.role, active: m.active });
  const [pw, setPw] = useState("");
  const inSchool = m.role !== "admin";

  return (
    <div className="member-row">
      {toast.node}
      {editing ? (
        <div className="stack" style={{ flex: 1 }}>
          <div className="row">
            <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} aria-label="Nome" />
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={{ flex: 2, minWidth: 180 }} aria-label="E-mail" />
            {inSchool && <SchoolRoleSelect value={f.role as SchoolRole} onChange={(role) => setF({ ...f, role })} disabled={isMe} />}
            <label className="small" style={{ fontWeight: 400, margin: 0 }}>
              <input type="checkbox" checked={f.active} disabled={isMe} onChange={(e) => setF({ ...f, active: e.target.checked })} /> ativa
            </label>
          </div>
          <div className="row">
            <button className="btn sm" disabled={pending} onClick={() => run(() => updateUser(m.id, f), () => setEditing(false))}>
              Salvar
            </button>
            <button className="btn ghost sm" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <span style={{ flex: 1 }} />
            <input
              type="password"
              placeholder="Nova senha (mín. 8)"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={{ maxWidth: 220 }}
              aria-label="Nova senha"
            />
            <button className="btn ghost sm" disabled={pending || pw.length < 8} onClick={() => run(() => resetUserPassword(m.id, pw), () => setPw(""))}>
              Redefinir senha
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{m.name}</strong> {isMe && <span className="faint">(você)</span>}
            <div className="faint">{m.email}</div>
          </div>
          <span className="small">{ROLE_LABEL[m.role]}</span>
          {m.role === "terapeuta" && <span className="small faint">{m.patients} paciente(s)</span>}
          {m.active ? <span className="pill high">ativa</span> : <span className="pill low">inativa</span>}
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        </>
      )}
    </div>
  );
}

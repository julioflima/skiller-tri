"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { Result } from "@/lib/result";
import { createUser, resetUserPassword, updateUser } from "../user-actions";

type Role = "admin" | "terapeuta";
type Member = { id: string; name: string; email: string; role: Role; schoolId?: string; school?: string; active: boolean; patients: number };
type SchoolOption = { id: string; name: string };

/** Escola só faz sentido para terapeuta; administrador é da plataforma. */
export function SchoolSelect({ role, value, schools, onChange }: { role: Role; value?: string; schools: SchoolOption[]; onChange: (id: string) => void }) {
  if (role !== "terapeuta") return null;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label="Escola" required style={{ flex: 1.5, minWidth: 160 }}>
      <option value="" disabled>
        Escola…
      </option>
      {schools.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
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

export function NewMemberForm({ schools }: { schools: SchoolOption[] }) {
  const { run, pending, toast } = useRunner();
  const empty = { name: "", email: "", password: "", role: "terapeuta" as Role, schoolId: schools.length === 1 ? schools[0].id : "" };
  const [f, setF] = useState(empty);
  return (
    <section className="card">
      {toast.node}
      <h2>Cadastrar diretamente</h2>
      <p className="muted small">Crie a conta com uma senha inicial e repasse à pessoa. Ela pode trocar a senha em "Minha conta".</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createUser(f), () => setF(empty));
        }}
      >
        <input type="text" placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required style={{ flex: 2, minWidth: 160 }} />
        <input type="email" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required style={{ flex: 2, minWidth: 180 }} />
        <input
          type="password"
          placeholder="Senha inicial (mín. 8)"
          autoComplete="new-password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          required
          style={{ flex: 1.5, minWidth: 160 }}
        />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} aria-label="Papel" style={{ flex: 1, minWidth: 140 }}>
          <option value="terapeuta">Terapeuta</option>
          <option value="admin">Administrador</option>
        </select>
        <SchoolSelect role={f.role} value={f.schoolId} schools={schools} onChange={(schoolId) => setF({ ...f, schoolId })} />
        <button className="btn warm" disabled={pending}>
          Cadastrar
        </button>
      </form>
    </section>
  );
}

export function MembersTable({ members, meId, schools }: { members: Member[]; meId: string; schools: SchoolOption[] }) {
  return (
    <section className="card">
      <h2>Contas</h2>
      <div className="stack">
        {members.map((m) => (
          <MemberRow key={m.id} m={m} isMe={m.id === meId} schools={schools} />
        ))}
      </div>
    </section>
  );
}

function MemberRow({ m, isMe, schools }: { m: Member; isMe: boolean; schools: SchoolOption[] }) {
  const { run, pending, toast } = useRunner();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: m.name, email: m.email, role: m.role, schoolId: m.schoolId, active: m.active });
  const [pw, setPw] = useState("");

  return (
    <div className="member-row">
      {toast.node}
      {editing ? (
        <div className="stack" style={{ flex: 1 }}>
          <div className="row">
            <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} aria-label="Nome" />
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={{ flex: 2, minWidth: 180 }} aria-label="E-mail" />
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} disabled={isMe} aria-label="Papel" style={{ flex: 1, minWidth: 140 }}>
              <option value="terapeuta">Terapeuta</option>
              <option value="admin">Administrador</option>
            </select>
            <SchoolSelect role={f.role} value={f.schoolId} schools={schools} onChange={(schoolId) => setF({ ...f, schoolId })} />
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
          <span className="small">{m.role === "admin" ? "administrador da plataforma" : `terapeuta · ${m.school ?? "sem escola"}`}</span>
          <span className="small faint">{m.patients} paciente(s)</span>
          {m.active ? <span className="pill high">ativa</span> : <span className="pill low">inativa</span>}
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        </>
      )}
    </div>
  );
}

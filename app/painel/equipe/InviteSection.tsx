"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyLink } from "@/app/components/CopyLink";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/useToast";
import { ROLE_LABEL, type Role, type SchoolRole } from "@/lib/roles";
import { createInvite, renewInvite, revokeInvite } from "../invite-actions";
import { SchoolRoleSelect } from "./TeamManager";

type PendingInvite = {
  id: string;
  token: string;
  email: string;
  name: string;
  role: Role;
  school?: string;
  expiresAt: string;
  expired: boolean;
};

/** Texto que acompanha o link ao copiar ou compartilhar (ex.: no WhatsApp). */
function inviteMessage(i: PendingInvite) {
  const ola = i.name ? `Olá, ${i.name.split(" ")[0]}!` : "Olá!";
  const papel = i.role === "admin" ? "dono(a) da plataforma" : `${ROLE_LABEL[i.role]}${i.school ? ` da escola ${i.school}` : ""}`;
  const prazo = new Date(i.expiresAt).toLocaleDateString("pt-BR");
  return `${ola} Você foi convidado(a) para entrar no Skiller como ${papel}. Crie sua conta pelo link abaixo (vale até ${prazo}):`;
}

/** Com `school`, convida terapeutas ou administradores dessa escola; sem, donos da plataforma. */
export function InviteSection({ invites, school }: { invites: PendingInvite[]; school?: { id: string; name: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", role: (school ? "terapeuta" : "admin") as Role, schoolId: school?.id });

  function run(action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, onOk?: () => void) {
    start(async () => {
      const res = await action();
      if (!res.ok) return toast.show(res.error);
      toast.show(res.message ?? "Feito.");
      onOk?.();
      router.refresh();
    });
  }

  return (
    <section className="card alt">
      {toast.node}
      <h2>Convidar por link</h2>
      <p className="muted small">
        Gere um link, copie e envie para a pessoa. Por ele, ela cria a própria conta com nome e senha. O link vale 7 dias e serve para
        uma conta só. Com o e-mail preenchido, só essa pessoa consegue usá-lo.
      </p>
      <form
        className="row tight"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createInvite(form), () => setForm({ ...form, name: "", email: "" }));
        }}
      >
        <input type="text" placeholder="Nome (opcional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
        <input type="email" placeholder="E-mail (opcional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ flex: 2, minWidth: 200 }} />
        {school && <SchoolRoleSelect value={form.role as SchoolRole} onChange={(role) => setForm({ ...form, role })} />}
        <button className="btn warm sm" disabled={pending}>
          {pending ? "Gerando…" : "Gerar link"}
        </button>
      </form>

      {invites.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Convite pendente</th>
                <th>Link</th>
                <th>Validade</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.name && <strong>{i.name} </strong>}
                    <span className="small">{i.email || "qualquer e-mail"}</span>
                    <div className="faint small">{i.role === "admin" ? "dono" : `${ROLE_LABEL[i.role]} · ${i.school ?? "sem escola"}`}</div>
                  </td>
                  <td style={{ maxWidth: 360 }}>{i.expired ? <span className="faint small">gere um novo link</span> : <CopyLink path={`/convite/${i.token}`} message={inviteMessage(i)} label={i.name || i.email || undefined} />}</td>
                  <td>
                    {i.expired ? (
                      <span className="pill low">expirado</span>
                    ) : (
                      <span className="small">até {new Date(i.expiresAt).toLocaleDateString("pt-BR")}</span>
                    )}
                  </td>
                  <td className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <button type="button" className="btn ghost sm icon-btn" disabled={pending} onClick={() => run(() => renewInvite(i.id))}>
                      <Icon name="refresh" />
                      Novo link
                    </button>
                    <button type="button" className="btn ghost sm danger" disabled={pending} onClick={() => run(() => revokeInvite(i.id))}>
                      Cancelar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

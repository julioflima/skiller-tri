import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/roles";
import { logout } from "@/app/auth-actions";
import { impersonateFromForm, stopImpersonating } from "./impersonate-actions";
import { NavLinks } from "./NavLinks";
import { BrandMark } from "@/app/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const db = await readDb();
  const school = user.schoolId ? db.schools.find((s) => s.id === user.schoolId) : undefined;
  // seletor "Ver como" do dono: cada escola ativa e as pessoas ativas dela
  const targets =
    user.role === "admin"
      ? db.schools
          .filter((s) => s.active)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map((s) => ({
            ...s,
            people: db.users
              .filter((u) => u.active && u.role !== "admin" && u.schoolId === s.id)
              .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, "pt-BR")),
          }))
      : [];
  // dono: plataforma (pacientes ficam dentro de cada escola); administrador da escola: pacientes e equipe; terapeuta: pacientes e análise
  const links = [
    ...(user.role === "admin" ? [{ href: "/painel/escolas", label: "Escolas" }] : [{ href: "/painel", label: "Pacientes" }]),
    { href: "/painel/analise", label: "Análise" },
    ...(user.role === "gestor" ? [{ href: "/painel/equipe", label: "Equipe" }] : []),
    ...(user.role === "admin"
      ? [
          { href: "/painel/testes", label: "Testes" },
          { href: "/painel/donos", label: "Donos" },
        ]
      : []),
    ...(user.impersonator ? [] : [{ href: "/painel/conta", label: "Minha conta" }]),
  ];
  const me = user.impersonator ? { name: user.impersonator.name, role: "dono" } : { name: user.name, role: `${ROLE_LABEL[user.role]}${school ? ` · ${school.name}` : ""}` };
  return (
    <main className="container page" style={{ paddingTop: 0 }}>
      <header className="topbar">
        <Link href="/painel" className="brand">
          <BrandMark />
          <span className="hand brand-slogan">acompanhamento por meio de testes</span>
        </Link>
        <div className="row">
          <span className="faint">
            {me.name} · {me.role}
          </span>
          {targets.length > 0 && (
            <form action={impersonateFromForm} className="row" style={{ gap: 6 }}>
              <select name="alvo" defaultValue="" required aria-label="Ver como" style={{ width: "auto", minWidth: 180 }}>
                <option value="" disabled>
                  Ver como…
                </option>
                {targets.map((s) => (
                  <optgroup key={s.id} label={s.name}>
                    <option value={`escola:${s.id}`}>{s.name} (escola inteira)</option>
                    {s.people.map((t) => (
                      <option key={t.id} value={`usuario:${t.id}`}>
                        {t.name} ({ROLE_LABEL[t.role]})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button className="btn ghost sm">Ver</button>
            </form>
          )}
          <form action={logout}>
            <button className="btn ghost sm">Sair</button>
          </form>
        </div>
      </header>
      {user.impersonator && (
        <div className="impersonation row spread">
          <span>
            Vendo como <strong>{user.scope === "escola" ? `a escola ${user.name}` : `${user.name}, ${ROLE_LABEL[user.role]}${school ? ` da ${school.name}` : ""}`}</strong>
          </span>
          <form action={stopImpersonating}>
            <button className="btn sm">Voltar a dono</button>
          </form>
        </div>
      )}
      <NavLinks links={links} />
      {children}
    </main>
  );
}

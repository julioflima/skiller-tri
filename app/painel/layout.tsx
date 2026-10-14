import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { logout } from "@/app/auth-actions";
import { stopImpersonating } from "./impersonate-actions";
import { NavLinks } from "./NavLinks";
import { BrandMark } from "@/app/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const school = user.schoolId ? (await readDb()).schools.find((s) => s.id === user.schoolId) : undefined;
  const links = [
    { href: "/painel", label: "Pacientes" },
    { href: "/painel/analise", label: "Análise" },
    ...(user.role === "admin"
      ? [
          { href: "/painel/testes", label: "Testes" },
          { href: "/painel/escolas", label: "Escolas" },
          { href: "/painel/administradores", label: "Administradores" },
        ]
      : []),
    ...(user.impersonator ? [] : [{ href: "/painel/conta", label: "Minha conta" }]),
  ];
  return (
    <main className="container page" style={{ paddingTop: 0 }}>
      <header className="topbar">
        <Link href="/painel" className="brand">
          <BrandMark />
          <span className="hand brand-slogan">acompanhamento por meio de testes</span>
        </Link>
        <div className="row">
          <span className="faint">
            {user.impersonator ? user.impersonator.name : user.name} · {user.role === "admin" || user.impersonator ? "administrador" : `terapeuta${school ? ` · ${school.name}` : ""}`}
          </span>
          <form action={logout}>
            <button className="btn ghost sm">Sair</button>
          </form>
        </div>
      </header>
      {user.impersonator && (
        <div className="impersonation row spread">
          <span>
            Vendo como <strong>{user.scope === "escola" ? `a escola ${user.name}` : `${user.name}, terapeuta${school ? ` da ${school.name}` : ""}`}</strong>
          </span>
          <form action={stopImpersonating}>
            <button className="btn sm">Voltar a administrador</button>
          </form>
        </div>
      )}
      <NavLinks links={links} />
      {children}
    </main>
  );
}

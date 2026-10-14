import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/roles";
import { logout } from "@/app/auth-actions";
import { NavLinks } from "./NavLinks";
import { BrandMark } from "@/app/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const db = await readDb();
  const school = user.schoolId ? db.schools.find((s) => s.id === user.schoolId) : undefined;
  // dono: plataforma (pacientes ficam dentro de cada escola); administrador da escola: pacientes e equipe; terapeuta: pacientes e análise
  const links = [
    ...(user.role === "admin" ? [{ href: "/painel/escolas", label: "Escolas" }] : [{ href: "/painel", label: "Pacientes" }]),
    { href: "/painel/analise", label: "Análise" },
    ...(user.role === "gestor" ? [{ href: "/painel/equipe", label: "Equipe" }] : []),
    ...(user.role === "admin" ? [{ href: "/painel/testes", label: "Testes" }] : []),
    // minha conta e, para o dono, os donos da plataforma
    { href: "/painel/configuracoes", label: "Configurações" },
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
            {user.name} · {ROLE_LABEL[user.role]}
            {school ? ` · ${school.name}` : ""}
          </span>
          <form action={logout}>
            <button className="btn ghost sm">Sair</button>
          </form>
        </div>
      </header>
      <NavLinks links={links} />
      {children}
    </main>
  );
}

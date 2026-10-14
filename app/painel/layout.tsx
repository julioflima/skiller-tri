import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { NavLinks } from "./NavLinks";
import { BrandMark } from "@/app/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const links = [
    { href: "/painel", label: "Pacientes" },
    { href: "/painel/analise", label: "Análise" },
    ...(user.role === "admin"
      ? [
          { href: "/painel/testes", label: "Testes" },
          { href: "/painel/equipe", label: "Equipe" },
          { href: "/painel/configuracoes", label: "Configurações" },
        ]
      : []),
    { href: "/painel/conta", label: "Minha conta" },
  ];
  return (
    <main className="container page" style={{ paddingTop: 0 }}>
      <header className="topbar">
        <Link href="/painel" className="brand">
          <BrandMark />
        </Link>
        <div className="row">
          <span className="faint">
            {user.name} · {user.role === "admin" ? "administrador" : "terapeuta"}
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

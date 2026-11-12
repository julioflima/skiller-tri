import { requirePageUser } from "@/lib/auth";
import { seesGaps } from "@/lib/assistant/access";
import { NavLinks } from "../NavLinks";

/** Configurações: a própria conta (todos), os donos da plataforma (só o dono) e as Lacunas do assistente (só LACUNAS_USER_IDS). */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const links = [
    { href: "/painel/configuracoes", label: "Minha conta", exact: true },
    ...(user.role === "admin" ? [{ href: "/painel/configuracoes/donos", label: "Donos" }] : []),
    ...(seesGaps(user) ? [{ href: "/painel/configuracoes/lacunas", label: "Lacunas" }] : []),
  ];
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Configurações</h1>
      {links.length > 1 && <NavLinks links={links} />}
      {children}
    </div>
  );
}

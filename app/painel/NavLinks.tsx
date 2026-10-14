"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** `exact`: ativa só no próprio endereço (ex.: a primeira aba de uma seção). */
export function NavLinks({ links }: { links: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    href === "/painel" ? path === "/painel" || path.startsWith("/painel/pacientes") : exact ? path === href : path.startsWith(href);
  return (
    <nav className="tabs">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`tab${isActive(l.href, l.exact) ? " active" : ""}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

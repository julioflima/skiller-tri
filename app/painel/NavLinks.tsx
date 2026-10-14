"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/painel" ? path === "/painel" || path.startsWith("/painel/pacientes") : path.startsWith(href);
  return (
    <nav className="tabs">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`tab${isActive(l.href) ? " active" : ""}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

"use client";

import { useEffect, useState } from "react";

/** Mostra um link de resposta com botão de copiar. O caminho é relativo; a origem vem do navegador. */
export function CopyLink({ path }: { path: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  return (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
      <code className="link-code" title={url}>
        {url}
      </code>
      <button
        type="button"
        className="btn ghost sm"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
      <a className="btn ghost sm" href={path} target="_blank" rel="noreferrer">
        Abrir
      </a>
    </span>
  );
}

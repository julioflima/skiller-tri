"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import { createTest } from "../test-actions";

export function NewTestForm({ tests }: { tests: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [mode, setMode] = useState("vazio");
  return (
    <form
      className="card alt row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createTest(name, mode);
          if (!res.ok) return toast.show(res.error);
          router.push(`/painel/testes/${(res.data as { id: string }).id}`);
        });
      }}
    >
      {toast.node}
      <input type="text" placeholder="Nome do novo teste" value={name} onChange={(e) => setName(e.target.value)} required style={{ flex: 2, minWidth: 200 }} />
      <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Ponto de partida" style={{ flex: 1.5, minWidth: 200 }}>
        <option value="vazio">Começar em branco</option>
        <option value="padrao">Modelo: 12 habilidades fora da caixa</option>
        {tests.map((t) => (
          <option key={t.id} value={t.id}>
            Copiar de: {t.name}
          </option>
        ))}
      </select>
      <button className="btn warm" disabled={pending || !name.trim()}>
        + Criar teste
      </button>
    </form>
  );
}

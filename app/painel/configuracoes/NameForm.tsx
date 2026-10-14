"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import { changeOwnName } from "../user-actions";

export function NameForm({ name }: { name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(name);
  const changed = value.trim() !== name && value.trim() !== "";
  return (
    <form
      className="row tight"
      style={{ marginBottom: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changeOwnName(value);
          toast.show(res.ok ? res.message ?? "Nome alterado." : res.error);
          if (res.ok) router.refresh();
        });
      }}
    >
      {toast.node}
      <div style={{ flex: 1, minWidth: 200 }}>
        <label htmlFor="acc-name">Nome</label>
        <input id="acc-name" type="text" autoComplete="name" value={value} onChange={(e) => setValue(e.target.value)} required />
      </div>
      <button className="btn sm" disabled={pending || !changed} style={{ alignSelf: "flex-end" }}>
        {pending ? "Salvando…" : "Salvar nome"}
      </button>
    </form>
  );
}

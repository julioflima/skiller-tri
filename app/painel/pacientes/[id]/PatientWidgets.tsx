"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import { createSession, savePatientNotes, updateSessionNotes } from "../../patient-actions";

export function NewSessionForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createSession(patientId, date, notes);
          toast.show(res.ok ? res.message ?? "Sessão registrada." : res.error);
          if (res.ok) setNotes("");
          router.refresh();
        });
      }}
    >
      {toast.node}
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} aria-label="Data da sessão" />
      <input type="text" placeholder="Anotação rápida (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      <button className="btn warm" disabled={pending}>
        {pending ? "Registrando…" : "+ Registrar sessão"}
      </button>
    </form>
  );
}

export function NotesBox({ id, initial, kind }: { id: string; initial: string; kind: "patient" | "session" }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Anotações…" />
      <button
        type="button"
        className="btn sm no-print"
        style={{ marginTop: 8 }}
        disabled={pending || value === saved}
        onClick={() =>
          start(async () => {
            const res = kind === "patient" ? await savePatientNotes(id, value) : await updateSessionNotes(id, value);
            if (res.ok) setSaved(value);
          })
        }
      >
        {pending ? "Salvando…" : value === saved ? "Salvo" : "Salvar anotações"}
      </button>
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn ghost sm" onClick={() => window.print()}>
      Imprimir / PDF
    </button>
  );
}

import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { PatientForm } from "../PatientForm";

export default async function NewPatientPage() {
  const user = await requirePageUser();
  const db = await readDb();
  const tests = db.tests.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const therapists = db.users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));
  return (
    <div className="stack">
      <Link href="/painel" className="faint">
        ← Pacientes
      </Link>
      <h1>Novo paciente</h1>
      {tests.length ? (
        <PatientForm tests={tests} therapists={therapists} isAdmin={user.role === "admin"} />
      ) : (
        <p className="muted">Nenhum teste ativo. Um administrador precisa criar ou ativar um teste primeiro.</p>
      )}
    </div>
  );
}

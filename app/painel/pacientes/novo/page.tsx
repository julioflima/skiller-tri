import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { patientOptions } from "@/lib/schools";
import { PatientForm } from "../PatientForm";

export default async function NewPatientPage() {
  await requirePageUser({ manager: true });
  const db = await readDb();
  const options = patientOptions(db);
  return (
    <div className="stack">
      <Link href="/painel" className="faint">
        ← Pacientes
      </Link>
      <h1>Novo paciente</h1>
      {options.tests.length && options.therapists.length ? (
        <PatientForm options={options} picksTherapist />
      ) : (
        <p className="muted">
          {!options.tests.length ? "Nenhum teste ativo para aplicar. O dono ativa os testes em Testes." : "Nenhum terapeuta ativo. Cadastre terapeutas em Equipe."}
        </p>
      )}
    </div>
  );
}

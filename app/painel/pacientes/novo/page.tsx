import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { schoolOptions } from "@/lib/schools";
import { PatientForm } from "../PatientForm";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ escola?: string }> }) {
  const user = await requirePageUser();
  const { escola } = await searchParams;
  const db = await readDb();
  // ?escola= (vindo da página da escola) deixa essa escola pré-selecionada
  const schools = schoolOptions(db, user)
    .filter((s) => s.tests.length && s.therapists.length)
    .sort((a, b) => Number(b.id === escola) - Number(a.id === escola));
  return (
    <div className="stack">
      <Link href="/painel" className="faint">
        ← Pacientes
      </Link>
      <h1>Novo paciente</h1>
      {schools.length ? (
        <PatientForm schools={schools} isAdmin={user.role === "admin"} />
      ) : (
        <p className="muted">
          {user.role === "admin"
            ? "Nenhuma escola ativa com testes e terapeutas. Configure em Escolas e Equipe."
            : "Sua escola ainda não aplica nenhum teste. Fale com a equipe da plataforma."}
        </p>
      )}
    </div>
  );
}

import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { schoolOptions } from "@/lib/schools";
import { PatientForm } from "../PatientForm";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ escola?: string }> }) {
  const user = await requirePageUser({ manager: true });
  const { escola } = await searchParams;
  const db = await readDb();
  const schools = schoolOptions(db, user)
    .filter((s) => s.tests.length && s.therapists.length)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // ?escola= (vindo da página da escola) deixa essa escola pré-selecionada; sem ele, o admin escolhe
  return (
    <div className="stack">
      <Link href={user.role === "admin" ? (escola ? `/painel/escolas/${escola}?aba=pacientes` : "/painel/escolas") : "/painel"} className="faint">
        ← {user.role === "admin" ? "Escola" : "Pacientes"}
      </Link>
      <h1>Novo paciente</h1>
      {schools.length ? (
        <PatientForm schools={schools} isAdmin={user.role === "admin"} picksTherapist defaultSchoolId={escola} />
      ) : (
        <p className="muted">
          {user.role === "admin"
            ? "Nenhuma escola ativa com testes e terapeutas. Configure em Escolas (testes e equipe de cada escola)."
            : "Sua escola ainda não aplica nenhum teste ou não tem terapeutas. Fale com a equipe da plataforma ou cadastre terapeutas em Equipe."}
        </p>
      )}
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { TeamSection } from "./TeamSection";

/** Equipe da escola, para o administrador dela. O dono gerencia a equipe dentro de cada escola, em Escolas. */
export default async function TeamPage() {
  const me = await requirePageUser({ manager: true });
  if (me.role === "admin") redirect("/painel/escolas");
  const db = await readDb();
  const school = db.schools.find((s) => s.id === me.schoolId);
  if (!school) notFound();
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Equipe</h1>
      <p className="muted" style={{ margin: 0 }}>
        Terapeutas respondem os testes e analisam os próprios pacientes. Administradores da escola cadastram pacientes, geram os links e cuidam da
        equipe da {school.name}.
      </p>
      <TeamSection db={db} school={school} me={me} />
    </div>
  );
}

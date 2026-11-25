import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { SCHOOL_NAME } from "@/lib/schools";
import { TeamSection } from "./TeamSection";

/** Equipe da escola (terapeutas e administradores), para o dono e o administrador da escola. */
export default async function TeamPage() {
  const me = await requirePageUser({ manager: true });
  const db = await readDb();
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Equipe</h1>
      <p className="muted" style={{ margin: 0 }}>
        Terapeutas respondem os testes e analisam os próprios pacientes. Administradores da escola cadastram pacientes, geram os links e cuidam da
        equipe da {SCHOOL_NAME}.
      </p>
      <TeamSection db={db} me={me} />
    </div>
  );
}

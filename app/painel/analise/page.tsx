import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { SchoolAnalysis, type AnalysisSearch } from "./SchoolAnalysis";

/** Análise da escola de quem é da escola. O dono analisa dentro de cada escola (aba Análise). */
export default async function AnalysisPage({ searchParams }: { searchParams: Promise<AnalysisSearch> }) {
  const user = await requirePageUser();
  if (user.role === "admin") redirect("/painel/escolas");
  const sp = await searchParams;
  const db = await readDb();
  const school = db.schools.find((s) => s.id === user.schoolId);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Análise{school ? ` · ${school.name}` : ""}</h1>
      {school ? (
        <SchoolAnalysis db={db} user={user} school={school} sp={sp} path="/painel/analise" />
      ) : (
        <p className="muted">Sua conta não está ligada a uma escola.</p>
      )}
    </div>
  );
}

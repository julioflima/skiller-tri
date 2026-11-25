import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { SchoolAnalysis, type AnalysisSearch } from "./SchoolAnalysis";

/** Análise dos pacientes: o dono e o administrador da escola veem todos; o terapeuta, os próprios. */
export default async function AnalysisPage({ searchParams }: { searchParams: Promise<AnalysisSearch> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const db = await readDb();

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Análise</h1>
      <SchoolAnalysis db={db} user={user} sp={sp} path="/painel/analise" />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { poolFor } from "@/lib/forms";
import { symbolSrc } from "@/app/components/SymbolImg";
import { CategoriesEditor, ScalesEditor, StagesEditor, TestMetaEditor } from "./Editors";
import { QuestionsEditor } from "./QuestionsEditor";

export default async function TestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await requirePageUser({ admin: true });
  const { id } = await params;
  const { aba = "perguntas" } = await searchParams;
  const db = await readDb();
  const test = db.tests.find((t) => t.id === id);
  if (!test) notFound();

  const used = new Set(db.forms.filter((f) => f.testId === test.id).flatMap((f) => f.items.map((i) => i.questionId)));
  const hasKey = Boolean(db.settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const tab = (key: string, label: string) => (
    <Link href={`/painel/testes/${test.id}?aba=${key}`} className={`tab${aba === key ? " active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="stack">
      <Link href="/painel/testes" className="faint">
        ← Testes
      </Link>
      <div className="row spread">
        <h1 style={{ margin: 0 }}>{test.name}</h1>
        {test.active ? <span className="pill high">ativo</span> : <span className="pill">inativo</span>}
      </div>
      <nav className="tabs" style={{ marginBottom: 0 }}>
        {tab("perguntas", `Perguntas (${test.questions.length})`)}
        {tab("classificacoes", `Classificações (${test.categories.length})`)}
        {tab("respostas", "Respostas e pesos")}
        {tab("etapas", "Etapas")}
        {tab("dados", "Dados do teste")}
      </nav>

      {aba === "classificacoes" ? (
        <CategoriesEditor
          testId={test.id}
          categories={categories.map((c) => ({ ...c, questions: test.questions.filter((q) => q.categoryId === c.id).length }))}
        />
      ) : aba === "respostas" ? (
        <ScalesEditor testId={test.id} scales={test.scales} usage={Object.fromEntries(test.scales.map((s) => [s.id, test.questions.filter((q) => q.scaleId === s.id).length]))} />
      ) : aba === "etapas" ? (
        <StagesEditor
          testId={test.id}
          stages={test.stages}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          poolSizes={Object.fromEntries(test.stages.flatMap((s) => s.rules.map((r) => [r.id, poolFor(test, r).length])))}
        />
      ) : aba === "dados" ? (
        <TestMetaEditor
          test={{ id: test.id, name: test.name, description: test.description, active: test.active }}
          patients={db.patients.filter((p) => p.testId === test.id).length}
        />
      ) : (
        <QuestionsEditor
          testId={test.id}
          hasKey={hasKey}
          categories={categories.map((c) => ({ id: c.id, name: c.name, order: c.order }))}
          scales={test.scales.map((s) => ({ id: s.id, name: s.name }))}
          questions={[...test.questions]
            .sort((a, b) => (categories.findIndex((c) => c.id === a.categoryId) - categories.findIndex((c) => c.id === b.categoryId)) || a.order - b.order)
            .map((q) => ({
              id: q.id,
              text: q.text,
              categoryId: q.categoryId,
              scaleId: q.scaleId,
              targets: q.targets,
              perspectives: q.perspectives,
              weight: q.weight,
              active: q.active,
              symbol: symbolSrc(q),
              symbolSource: q.symbolSource,
              used: used.has(q.id),
            }))}
        />
      )}
    </div>
  );
}

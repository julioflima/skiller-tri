import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { poolFor } from "@/lib/forms";
import { optionSymbolSrc } from "@/app/components/SymbolImg";
import { DEFAULT_SYMBOL_PROMPT, symbolPromptFor } from "@/lib/symbols";
import { CategoriesEditor, LandingEditor, ScalesEditor, StagesEditor, TestMetaEditor } from "./Editors";
import { QuestionsEditor } from "./QuestionsEditor";
import { Coverage } from "./Coverage";
import { TestChat } from "./TestChat";

// o assistente pode encadear várias chamadas à IA numa única ação
export const maxDuration = 300;

export default async function TestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await requirePageUser({ admin: true });
  const { id } = await params;
  const { aba = "perguntas" } = await searchParams;
  const db = await readDb();
  const test = db.tests.find((t) => t.id === id);
  if (!test) notFound();

  const used = new Set(db.forms.filter((f) => f.testId === test.id).flatMap((f) => f.items.map((i) => i.questionId)));
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const tab = (key: string, label: string, extra = "") => (
    <Link href={`/painel/testes/${test.id}?aba=${key}`} className={`tab${extra}${aba === key ? " active" : ""}`}>
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
        <div className="row">
          {test.active ? <span className="pill high">ativo</span> : <span className="pill">inativo</span>}
          {test.landing && (
            <a
              href={test.landing.published && test.active ? `/teste/${test.landing.slug}` : `/teste/${test.landing.slug}?previa=1`}
              target="_blank"
              rel="noreferrer"
              className="btn ghost sm"
            >
              Ver landing page ↗
            </a>
          )}
        </div>
      </div>
      <Coverage test={test} />
      <nav className="tabs" style={{ marginBottom: 0 }}>
        {tab("assistente", "✦ Assistente IA", " tab-ai")}
        {tab("perguntas", `Perguntas (${test.questions.length})`)}
        {tab("classificacoes", `Classificações (${test.categories.length})`)}
        {tab("respostas", "Respostas e pesos")}
        {tab("etapas", "Etapas")}
        {tab("dados", "Dados do teste")}
        {tab("landing", "Landing page")}
      </nav>

      {aba === "landing" ? (
        <LandingEditor
          testId={test.id}
          landing={test.landing}
          suggestedSlug={test.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40)}
        />
      ) : aba === "assistente" ? (
        <TestChat
          testId={test.id}
          hasKey={hasKey}
          refs={[
            ...test.questions.map((q) => ({
              kind: "pergunta" as const,
              id: q.id,
              label: q.text,
              hint: [categories.find((c) => c.id === q.categoryId)?.name, q.active ? "" : "inativa"].filter(Boolean).join(" · "),
            })),
            ...categories.map((c) => ({ kind: "classificacao" as const, id: c.id, label: c.name })),
            ...test.scales.map((s) => ({ kind: "escala" as const, id: s.id, label: s.name, hint: s.options.map((o) => o.label).join(" · ") })),
            ...test.stages.map((s) => ({ kind: "etapa" as const, id: s.id, label: s.name, hint: s.kind === "inicial" ? "inicial" : "sessão" })),
          ]}
        />
      ) : aba === "classificacoes" ? (
        <CategoriesEditor
          testId={test.id}
          categories={categories.map((c) => ({ ...c, questions: test.questions.filter((q) => q.categoryId === c.id).length }))}
        />
      ) : aba === "respostas" ? (
        <ScalesEditor
          testId={test.id}
          hasKey={hasKey}
          scales={test.scales}
          symbols={Object.fromEntries(test.scales.flatMap((s) => s.options.map((o) => [o.id, optionSymbolSrc(s, o.id)])))}
          usage={Object.fromEntries(test.scales.map((s) => [s.id, test.questions.filter((q) => q.scaleId === s.id).length]))} />
      ) : aba === "etapas" ? (
        <StagesEditor
          testId={test.id}
          stages={test.stages}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          poolSizes={Object.fromEntries(test.stages.flatMap((s) => s.rules.map((r) => [r.id, poolFor(test, r).length])))}
        />
      ) : aba === "dados" ? (
        <TestMetaEditor
          test={{ id: test.id, name: test.name, description: test.description, active: test.active, symbolPrompt: symbolPromptFor(test) }}
          defaultSymbolPrompt={DEFAULT_SYMBOL_PROMPT}
          patients={db.patients.filter((p) => p.testId === test.id).length}
          forms={db.forms.filter((f) => f.testId === test.id).length}
        />
      ) : (
        <QuestionsEditor
          testId={test.id}
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
              used: used.has(q.id),
            }))}
        />
      )}
    </div>
  );
}

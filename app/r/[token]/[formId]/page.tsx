import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { resolveToken } from "@/lib/portal";
import { optionSymbolSrc } from "@/app/components/SymbolImg";
import { Quiz, type QuizItem } from "./Quiz";

export const dynamic = "force-dynamic";

export default async function AnswerPage({ params }: { params: Promise<{ token: string; formId: string }> }) {
  const { token, formId } = await params;
  const db = await readDb();
  const who = resolveToken(db, token);
  const form = db.forms.find((f) => f.id === formId);
  if (!who || !form || !who.owns(form)) notFound();

  if (form.finishedAt) {
    return (
      <main className="container narrow page" style={{ textAlign: "center" }}>
        <div className="card" style={{ marginTop: "12vh" }}>
          <p className="hand" style={{ margin: 0 }}>pronto!</p>
          <h1>Obrigado</h1>
          <p className="muted">Suas respostas foram enviadas.</p>
          <Link href={`/r/${token}`} className="btn ghost">
            Voltar
          </Link>
        </div>
      </main>
    );
  }

  const test = db.tests.find((t) => t.id === form.testId);
  const questions = new Map(test?.questions.map((q) => [q.id, q]));
  const scales = new Map(test?.scales.map((s) => [s.id, s]));
  // Só o texto e as opções (com seus símbolos) vão ao navegador: a classificação e os pesos ficam no servidor.
  const items: QuizItem[] = form.items.map((it) => {
    const q = questions.get(it.questionId);
    const scale = q ? scales.get(q.scaleId) : undefined;
    return {
      text: q?.text ?? "Pergunta indisponível",
      block: it.block,
      options: scale?.options.map((o) => ({ id: o.id, label: o.label, description: o.description, symbol: optionSymbolSrc(scale, o.id) })) ?? [],
    };
  });
  const answers = Object.fromEntries(Object.entries(form.answers).map(([k, a]) => [k, a.optionId]));

  return (
    <main className="quiz-page">
      <Quiz token={token} formId={form.id} name={who.name} items={items} blocks={form.blocks.map((b) => b.instruction)} initialAnswers={answers} />
    </main>
  );
}

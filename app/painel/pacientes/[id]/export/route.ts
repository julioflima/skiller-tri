import { canSeePatient, currentUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ABOUT_LABEL, respondentName } from "@/lib/forms";
import { normalized } from "@/lib/scoring";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // evita injeção de fórmula ao abrir no Excel
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV em formato longo: uma linha por resposta. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Não autorizado", { status: 401 });
  const { id } = await params;
  const db = await readDb();
  const p = db.patients.find((x) => x.id === id);
  if (!p || !canSeePatient(user, p)) return new Response("Não encontrado", { status: 404 });
  const therapist = db.users.find((u) => u.id === p.therapistId);

  const rows: unknown[][] = [
    ["paciente", "etapa", "sessao", "data_sessao", "quem_respondeu", "papel", "sobre", "classificacao", "pergunta", "peso_pergunta", "resposta", "peso_resposta", "percentual", "respondido_em"],
  ];
  const forms = db.forms.filter((f) => f.patientId === p.id).sort((a, b) => a.sessionNumber - b.sessionNumber);
  for (const f of forms) {
    const test = db.tests.find((t) => t.id === f.testId);
    const session = db.sessions.find((s) => s.patientId === p.id && s.number === f.sessionNumber);
    const options = new Map(test?.scales.flatMap((s) => s.options).map((o) => [o.id, o.label]));
    f.items.forEach((item, idx) => {
      const a = f.answers[idx];
      if (!a) return;
      const q = test?.questions.find((x) => x.id === item.questionId);
      rows.push([
        p.name,
        f.stageName,
        f.sessionNumber || "",
        session?.date ?? "",
        respondentName(p, f, therapist?.name),
        f.respondent.role,
        ABOUT_LABEL[item.about],
        test?.categories.find((c) => c.id === q?.categoryId)?.name ?? "",
        q?.text ?? "",
        q?.weight ?? "",
        options.get(a.optionId) ?? "",
        String(a.weight).replace(".", ","),
        Math.round(normalized(a) * 100),
        a.answeredAt,
      ]);
    });
  }

  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\n");
  const slug = p.name.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="skiller-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

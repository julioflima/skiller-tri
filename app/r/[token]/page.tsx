import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { formProgress } from "@/lib/forms";
import { resolveToken } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await readDb();
  const who = resolveToken(db, token);
  if (!who) notFound();
  const patients = new Map(db.patients.map((p) => [p.id, p.name]));
  const forms = db.forms.filter(who.owns).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = forms.filter((f) => !f.finishedAt).reverse();
  const done = forms.filter((f) => f.finishedAt);
  const multiPatient = new Set(forms.map((f) => f.patientId)).size > 1;
  const title = (f: (typeof forms)[number]) =>
    `${f.sessionNumber ? `Sessão ${f.sessionNumber}` : f.stageName}${multiPatient ? ` · ${patients.get(f.patientId)}` : ""}`;

  return (
    <main className="container narrow page">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" /> Skiller
        </span>
      </header>
      <p className="hand" style={{ margin: 0 }}>{who.roleLabel.toLowerCase()}</p>
      <h1>Olá, {who.name.split(" ")[0]}</h1>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Para responder</h2>
        {pending.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nada pendente agora. Quando houver um novo questionário, ele aparece aqui neste mesmo link.
          </p>
        ) : (
          <div className="stack">
            {pending.map((f) => {
              const pr = formProgress(f);
              return (
                <Link key={f.id} href={`/r/${token}/${f.id}`} className="form-link">
                  <span>
                    <strong>{title(f)}</strong>
                    <span className="faint" style={{ display: "block" }}>
                      {pr.total} perguntas{pr.done ? ` · ${pr.done} já respondidas` : ""}
                    </span>
                  </span>
                  <span className="btn warm sm">{pr.done ? "Continuar" : "Começar"}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="card alt" style={{ marginTop: 18 }}>
          <h3>Já enviados</h3>
          {done.map((f) => (
            <p key={f.id} className="small row spread" style={{ margin: "6px 0" }}>
              <span>{title(f)}</span>
              <span className="faint">{new Date(f.finishedAt!).toLocaleDateString("pt-BR")}</span>
            </p>
          ))}
        </section>
      )}
    </main>
  );
}

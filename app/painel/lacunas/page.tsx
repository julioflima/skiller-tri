import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { GAP_KINDS } from "@/lib/assistant-tools";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { GapStatus } from "./GapStatus";

export const dynamic = "force-dynamic";

const STATUS = { aberta: "Abertas", resolvida: "Resolvidas", ignorada: "Ignoradas" } as const;
type Status = keyof typeof STATUS;

const date = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Log do que o assistente não conseguiu responder ou fazer: mostra o que falta na plataforma. */
export default async function GapsPage({ searchParams }: { searchParams: Promise<{ status?: string; tipo?: string }> }) {
  await requirePageUser({ admin: true });
  const sp = await searchParams;
  const status: Status = sp.status && sp.status in STATUS ? (sp.status as Status) : "aberta";
  const kind = sp.tipo && sp.tipo in GAP_KINDS ? sp.tipo : undefined;
  const [gaps, counts, byTopic] = await Promise.all([
    prisma.assistantGap.findMany({ where: { status, ...(kind ? { kind } : {}) }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.assistantGap.groupBy({ by: ["status"], _count: true }),
    prisma.assistantGap.groupBy({ by: ["topic"], where: { status: "aberta" }, _count: true, orderBy: { _count: { topic: "desc" } }, take: 12 }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const href = (s: Status, k?: string) => `/painel/lacunas?status=${s}${k ? `&tipo=${k}` : ""}`;

  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Lacunas do assistente</h2>
        <p className="muted small">
          Tudo o que o assistente não conseguiu responder ou fazer, com quem pediu. Use para decidir o que acrescentar à plataforma e aos testes. Marque como
          resolvida quando a lacuna for coberta.
        </p>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <Link key={s} href={href(s, kind)} className={`btn sm${s === status ? "" : " ghost"}`}>
              {STATUS[s]} ({count(s)})
            </Link>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          <Link href={href(status)} className={`pill${kind ? "" : " ia"}`}>
            Todos os tipos
          </Link>
          {Object.entries(GAP_KINDS).map(([k, label]) => (
            <Link key={k} href={href(status, k)} className={`pill${k === kind ? " ia" : ""}`}>
              {label}
            </Link>
          ))}
        </div>
        {!!byTopic.length && (
          <p className="small" style={{ marginBottom: 0 }}>
            <b>Temas mais pedidos (abertas):</b> {byTopic.map((t) => `${t.topic} (${t._count})`).join(" · ")}
          </p>
        )}
      </section>

      <section className="card">
        {gaps.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Pedido</th>
                  <th>Por que não deu</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.id}>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {date(g.createdAt)}
                    </td>
                    <td className="small">
                      {g.userName}
                      <div className="faint">
                        {ROLE_LABEL[g.role as Role] ?? g.role}
                        {g.schoolName ? ` · ${g.schoolName}` : ""}
                      </div>
                    </td>
                    <td>
                      {g.question}
                      <div className="small faint">
                        {GAP_KINDS[g.kind] ?? g.kind} · {g.topic}
                      </div>
                    </td>
                    <td className="small">
                      {g.reason}
                      {g.note && <div className="faint">Nota: {g.note}</div>}
                    </td>
                    <td>
                      <GapStatus id={g.id} status={g.status as Status} note={g.note ?? ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhuma lacuna {STATUS[status].toLowerCase().replace(/s$/, "")} {kind ? "deste tipo" : ""} por enquanto.</p>
        )}
      </section>
    </>
  );
}

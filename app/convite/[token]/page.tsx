import { readDb } from "@/lib/db";
import { AcceptInviteForm } from "./AcceptInviteForm";
import { BrandMark } from "@/app/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await readDb();
  const invite = db.invites.find((i) => i.token === token && !i.acceptedAt && new Date(i.expiresAt) > new Date());

  return (
    <main className="container narrow page">
      <div style={{ maxWidth: 420, margin: "12vh auto 0" }}>
        <p className="brand" style={{ marginBottom: 6 }}>
          <BrandMark large />
        </p>
        <p className="hand" style={{ margin: "0 0 20px" }}>habilidades fora da caixa</p>
        <div className="card">
          {invite ? (
            <AcceptInviteForm
              token={token}
              email={invite.email}
              name={invite.name}
              role={invite.role}
              school={db.schools.find((s) => s.id === invite.schoolId)?.name}
            />
          ) : (
            <>
              <h2>Convite indisponível</h2>
              <p className="muted" style={{ margin: 0 }}>
                Este link é inválido, já foi usado ou expirou. Peça um novo convite ao administrador.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

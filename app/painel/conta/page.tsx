import { requirePageUser } from "@/lib/auth";
import { CopyLink } from "@/app/components/CopyLink";
import { ActionButton } from "@/app/components/ActionButton";
import { regenerateTherapistLink } from "../user-actions";
import { PasswordForm } from "./PasswordForm";

export default async function AccountPage() {
  const user = await requirePageUser();
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Minha conta</h1>
      <section className="card">
        <h2>{user.name}</h2>
        <p className="muted">{user.email}</p>
        <h3>Meu link de respostas</h3>
        <p className="muted small">Reúne os formulários de terapeuta de todos os seus pacientes em um só lugar.</p>
        <div className="row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <CopyLink path={`/r/${user.token}`} />
          </div>
          <ActionButton action={regenerateTherapistLink} confirmText="Gerar um novo link? O atual deixará de funcionar.">
            Novo link
          </ActionButton>
        </div>
      </section>
      <PasswordForm />
    </div>
  );
}

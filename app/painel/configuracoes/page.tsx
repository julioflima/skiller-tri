import { requirePageUser } from "@/lib/auth";
import { CopyLink } from "@/app/components/CopyLink";
import { Icon } from "@/app/components/Icon";
import { ActionButton } from "@/app/components/ActionButton";
import { regenerateTherapistLink } from "../user-actions";
import { NameForm } from "./NameForm";
import { PasswordForm } from "./PasswordForm";

export default async function AccountPage() {
  const user = await requirePageUser();
  return (
    <>
      <section className="card">
        <NameForm name={user.name} />
        <p className="muted">{user.email}</p>
        {user.role === "terapeuta" && (
          <>
        <h3>Meu link de respostas</h3>
        <p className="muted small">Reúne os formulários de terapeuta de todos os seus pacientes em um só lugar.</p>
        <div className="row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <CopyLink path={`/r/${user.token}`} label={user.name ?? undefined} />
          </div>
          <ActionButton action={regenerateTherapistLink} confirmText="Gerar um novo link? O atual deixará de funcionar." className="btn ghost sm icon-btn">
            <Icon name="refresh" />
            Novo link
          </ActionButton>
        </div>
          </>
        )}
      </section>
      <PasswordForm />
    </>
  );
}

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await currentUser()) redirect("/painel");
  return (
    <main className="container narrow page">
      <div style={{ maxWidth: 420, margin: "12vh auto 0" }}>
        <p className="brand" style={{ marginBottom: 6 }}>
          <span className="brand-dot" /> Skiller
        </p>
        <p className="hand" style={{ margin: "0 0 20px" }}>habilidades fora da caixa</p>
        <div className="card">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

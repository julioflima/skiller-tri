import { requirePageUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  await requirePageUser({ admin: true });
  const db = await readDb();
  const key = db.settings.anthropicApiKey;
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Configurações</h1>
      <SettingsForm
        model={db.settings.model}
        workspaceId={db.settings.anthropicWorkspaceId ?? ""}
        envWorkspace={Boolean(process.env.ANTHROPIC_WORKSPACE_ID)}
        maskedKey={key ? `${key.slice(0, 7)}…${key.slice(-4)}` : ""}
        envKey={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}

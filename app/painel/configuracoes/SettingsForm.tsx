"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import { saveSettings, testApiKey } from "../user-actions";

export function SettingsForm({
  model,
  workspaceId,
  envWorkspace,
  maskedKey,
  envKey,
}: {
  model: string;
  workspaceId: string;
  envWorkspace: boolean;
  maskedKey: string;
  envKey: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ apiKey: "", clearKey: false, workspaceId, model });
  const [preview, setPreview] = useState<string[]>();

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveSettings(f);
          toast.show(res.ok ? res.message ?? "Salvo." : res.error);
          if (res.ok) setF({ ...f, apiKey: "", clearKey: false });
          router.refresh();
        });
      }}
    >
      {toast.node}
      <h2 style={{ marginBottom: 0 }}>Inteligência artificial</h2>
      <p className="muted small" style={{ margin: 0 }}>
        A chave da Anthropic é usada só no servidor, para desenhar um símbolo para cada pergunta. Ela nunca é enviada ao navegador. As instruções de estilo dos símbolos ficam em cada teste, na aba “Dados do teste”.
      </p>
      <div>
        <label htmlFor="apiKey">Chave da API (Anthropic)</label>
        <input
          id="apiKey"
          type="password"
          autoComplete="off"
          value={f.apiKey}
          onChange={(e) => setF({ ...f, apiKey: e.target.value })}
          placeholder={maskedKey ? `Cadastrada: ${maskedKey}. Preencha para trocar` : envKey ? "Usando ANTHROPIC_API_KEY do servidor" : "sk-ant-…"}
        />
        {maskedKey && (
          <label className="small" style={{ fontWeight: 400, marginTop: 8 }}>
            <input type="checkbox" checked={f.clearKey} onChange={(e) => setF({ ...f, clearKey: e.target.checked })} /> remover a chave cadastrada
          </label>
        )}
      </div>
      <div>
        <label htmlFor="workspaceId">
          ID do workspace <span className="faint">(só se a chave não for de um workspace)</span>
        </label>
        <input
          id="workspaceId"
          type="text"
          autoComplete="off"
          value={f.workspaceId}
          onChange={(e) => setF({ ...f, workspaceId: e.target.value })}
          placeholder={envWorkspace ? "Usando ANTHROPIC_WORKSPACE_ID do servidor" : "wrkspc_…"}
        />
      </div>
      <div>
        <label htmlFor="model">Modelo</label>
        <input id="model" type="text" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
      </div>
      <div className="row">
        <button className="btn" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await testApiKey();
              toast.show(res.ok ? res.message ?? "OK" : res.error);
              setPreview(res.ok ? (res.data as { srcs: string[] } | undefined)?.srcs : undefined);
            })
          }
        >
          Testar chave salva
        </button>
        {preview?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} className="symbol" src={src} width={64} height={64} alt="símbolo de teste" />
        ))}
      </div>
    </form>
  );
}

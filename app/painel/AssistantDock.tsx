"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  listAssistantConversations,
  loadAssistantConversation,
  sendAssistantMessage,
  type AssistantTurn,
  type ConversationSummary,
} from "./assistant-actions";

type Shown = AssistantTurn & { error?: boolean };

const SUGGESTIONS: Record<string, string[]> = {
  admin: ["Quais escolas estão ativas e quais testes cada uma aplica?", "Quantas perguntas ativas tem cada classificação do KAY12?", "Crie um convite de administrador para uma escola"],
  gestor: ["Quais pacientes ainda não responderam o início do tratamento?", "Cadastre um paciente novo", "Quem está na minha equipe?"],
  terapeuta: ["Como está a evolução dos meus pacientes?", "Registre uma sessão para hoje", "Quais formulários estão pendentes?"],
};

/** Markdown mínimo: **negrito** e listas com "- ". */
function rich(text: string) {
  return text.split("\n").map((line, i) => {
    const item = /^\s*[-*] /.test(line);
    const body = (item ? line.replace(/^\s*[-*] /, "") : line).split(/(\*\*[^*]+\*\*)/g).map((part, k) => (part.startsWith("**") && part.endsWith("**") ? <b key={k}>{part.slice(2, -2)}</b> : part));
    return (
      <span key={i} className={item ? "ai-li" : undefined}>
        {body}
        {"\n"}
      </span>
    );
  });
}

const LAST = "assistant:last";

export function AssistantDock({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [turns, setTurns] = useState<Shown[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loaded = useRef(false);

  // ao abrir pela primeira vez, traz as conversas e reabre a última
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    start(async () => {
      const r = await listAssistantConversations();
      if (!r.ok) return;
      setList(r.data!);
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST);
      } catch {}
      if (last && r.data!.some((c) => c.id === last)) await openConversation(last);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, current]);

  const remember = (id: string | null) => {
    try {
      if (id) localStorage.setItem(LAST, id);
      else localStorage.removeItem(LAST);
    } catch {}
  };

  async function openConversation(id: string) {
    const r = await loadAssistantConversation(id);
    if (!r.ok) return;
    setCurrent(id);
    setTurns(r.data!.turns);
    remember(id);
  }

  const fresh = () => {
    setCurrent(null);
    setTurns([]);
    remember(null);
  };

  const send = (text: string) => {
    const said = text.trim();
    if (!said || pending) return;
    setTurns((t) => [...t, { role: "user", text: said, actions: [] }]);
    setDraft("");
    start(async () => {
      const r = await sendAssistantMessage(current, said);
      if (!r.ok) {
        setTurns((t) => [...t, { role: "assistant", text: r.error, actions: [], error: true }]);
        return;
      }
      setCurrent(r.data!.conversation.id);
      setTurns(r.data!.conversation.turns);
      setList(r.data!.conversations);
      remember(r.data!.conversation.id);
      if (r.data!.changed) router.refresh();
    });
  };

  return (
    <>
      <button type="button" className={`ai-fab${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-label={open ? "Fechar assistente" : "Abrir assistente"}>
        {open ? "×" : "✦"}
        {!open && <span>Assistente</span>}
      </button>
      {open && (
        <aside className="ai-panel" aria-label="Assistente">
          <header className="ai-head">
            <b>Assistente</b>
            <select
              className="ai-select"
              value={current ?? ""}
              disabled={pending}
              onChange={(e) => (e.target.value ? start(() => openConversation(e.target.value)) : fresh())}
            >
              <option value="">Nova conversa</option>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn ghost sm" disabled={pending || !current} onClick={fresh}>
              Nova
            </button>
          </header>
          <div className="ai-log">
            {!turns.length && !pending && (
              <div className="ai-empty">
                <p className="muted small">
                  Peço por você o que a plataforma faz: consultar e cadastrar pacientes, sessões, links, equipe{role === "admin" ? ", escolas e testes" : ""}. Não excluo nada.
                  O que eu não souber responder fica anotado para a equipe do Skiller.
                </p>
                {(SUGGESTIONS[role] ?? SUGGESTIONS.terapeuta).map((s) => (
                  <button key={s} type="button" className="btn sm" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`chat-msg ${t.role}${t.error ? " error" : ""}`}>
                {(t.text || !t.actions.length) && <div className="chat-bubble">{t.role === "assistant" ? rich(t.text || "…") : t.text}</div>}
                {!!t.actions.length && (
                  <ul className="chat-changes small">
                    {t.actions.map((a, k) => (
                      <li key={k} className={a.ok ? "" : "error"}>
                        {a.ok ? "✓" : "✕"} {a.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {pending && (
              <div className="chat-msg assistant">
                <div className="chat-bubble faint">Trabalhando nisso…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="ai-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              placeholder="Pergunte ou peça algo…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <button className="btn warm sm" disabled={!draft.trim() || pending}>
              Enviar
            </button>
          </form>
        </aside>
      )}
    </>
  );
}

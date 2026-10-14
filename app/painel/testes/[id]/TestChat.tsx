"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { chatWithTest, type ChatReply, type ChatTurn } from "./chat-actions";

type Message = ChatTurn & { changes?: ChatReply["changes"]; error?: boolean };

const SUGGESTIONS = [
  "Revise o texto das perguntas para ficar mais claro para adolescentes",
  "Crie 3 perguntas novas para a classificação com menos perguntas",
  "Quais classificações têm poucas perguntas para o terapeuta?",
  "Desative as perguntas duplicadas ou muito parecidas",
];

const storageKey = (testId: string) => `test-chat:${testId}`;

export function TestChat({ testId, hasKey }: { testId: string; hasKey: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(testId));
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, [testId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(testId), JSON.stringify(messages));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, testId]);

  const send = (text: string) => {
    if (!text.trim() || pending) return;
    const next: Message[] = [...messages, { role: "user", text: text.trim() }];
    setMessages(next);
    setDraft("");
    start(async () => {
      // mensagens de erro ficam só na tela, não voltam para a IA
      const history = next.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
      const res = await chatWithTest(testId, history);
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", text: res.error, error: true }]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", text: res.data!.text, changes: res.data!.changes }]);
      if (res.data!.changes.length) router.refresh();
    });
  };

  if (!hasKey) {
    return (
      <section className="card">
        <p className="muted">Cadastre a chave da API em Configurações para usar o assistente.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card chat">
        <p className="muted small">
          Peça alterações em linguagem natural: criar, reescrever ou desativar perguntas, ajustar escalas, classificações e etapas. As mudanças são aplicadas na hora.
        </p>
        {!messages.length && (
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn sm" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="chat-log">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}${m.error ? " error" : ""}`}>
              <div className="chat-bubble">{m.text}</div>
              {!!m.changes?.length && (
                <ul className="chat-changes small">
                  {m.changes.map((c, k) => (
                    <li key={k} className={c.ok ? "" : "error"}>
                      {c.ok ? "✓" : "✕"} {c.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {pending && (
            <div className="chat-msg assistant">
              <div className="chat-bubble faint">Pensando e aplicando as mudanças…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </section>
      <form
        className="card alt chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          placeholder="Ex.: reescreva a pergunta sobre amizades para o responsável"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
        />
        <div className="row spread">
          <button
            type="button"
            className="linkbtn small"
            disabled={pending || !messages.length}
            onClick={() => setMessages([])}
          >
            Limpar conversa
          </button>
          <button className="btn warm" disabled={!draft.trim() || pending}>
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}

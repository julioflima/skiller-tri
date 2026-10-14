"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { chatWithTest, type ChatReply, type ChatTurn } from "./chat-actions";

/** Item do teste que pode ser citado no chat com um símbolo (ex.: @ para perguntas). */
export type ChatRef = { kind: RefKind; id: string; label: string; hint?: string };
type RefKind = "pergunta" | "classificacao" | "escala" | "etapa";

type Message = ChatTurn & { changes?: ChatReply["changes"]; error?: boolean; ai?: string };

const TRIGGERS: Record<string, { kind: RefKind; name: string; example: string }> = {
  "@": { kind: "pergunta", name: "pergunta", example: "reescreva @[Tenho amigos…] para o responsável" },
  "#": { kind: "classificacao", name: "classificação", example: "crie 3 perguntas em #[Empatia]" },
  $: { kind: "escala", name: "escala", example: "adicione a opção “Quase sempre” em $[Frequência]" },
  "!": { kind: "etapa", name: "etapa", example: "sorteie 5 perguntas por pessoa em ![Sessão]" },
};
const SYMBOL_OF = Object.fromEntries(Object.entries(TRIGGERS).map(([sym, t]) => [t.kind, sym])) as Record<RefKind, string>;
const TOKEN_RE = /([@#$!])\[([^\]]+)\]/g;
const MAX_LABEL = 48;

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const short = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1).trimEnd()}…` : s).replace(/[\[\]]/g, "");
const tokenOf = (r: ChatRef) => `${SYMBOL_OF[r.kind]}[${short(r.label)}]`;

/** Símbolo + busca logo antes do cursor (o símbolo precisa abrir a palavra). */
function findQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  for (let i = before.length - 1; i >= 0 && before.length - i <= 60; i--) {
    const ch = before[i];
    if (ch === "\n" || ch === "]") return null;
    if (TRIGGERS[ch] && (i === 0 || /\s|\(/.test(before[i - 1]))) return { start: i, symbol: ch, query: before.slice(i + 1) };
  }
  return null;
}

/** Texto enviado à IA: o que a pessoa escreveu + os ids dos itens citados. */
function expandRefs(text: string, refs: ChatRef[]) {
  const cited = new Map<string, ChatRef>();
  for (const m of text.matchAll(TOKEN_RE)) {
    const r = refs.find((x) => SYMBOL_OF[x.kind] === m[1] && short(x.label) === m[2]);
    if (r) cited.set(m[0], r);
  }
  if (!cited.size) return text;
  const list = [...cited].map(([tok, r]) => `- ${tok} = ${TRIGGERS[SYMBOL_OF[r.kind]].name} id ${r.id}${r.label !== short(r.label) ? ` ("${r.label}")` : ""}`);
  return `${text}\n\nItens citados:\n${list.join("\n")}`;
}

/** Mostra os itens citados como etiquetas na bolha da mensagem. */
function withChips(text: string, className = "chat-chip") {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className={className}>
        {className === "chat-chip" ? `${m[1]} ${m[2]}` : m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

const SUGGESTIONS = [
  "Revise o texto das perguntas para ficar mais claro para adolescentes",
  "Crie 3 perguntas novas para a classificação com menos perguntas",
  "Quais classificações têm poucas perguntas para o terapeuta?",
  "Desative as perguntas duplicadas ou muito parecidas",
];

const storageKey = (testId: string) => `test-chat:${testId}`;

export function TestChat({ testId, hasKey, refs }: { testId: string; hasKey: boolean; refs: ChatRef[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);

  const q = findQuery(draft, caret);
  const open = q && closedAt !== q.start ? q : null;
  const options = open
    ? refs
        .filter((r) => r.kind === TRIGGERS[open.symbol].kind)
        .filter((r) => norm(`${r.label} ${r.hint ?? ""}`).includes(norm(open.query.trim())))
        .slice(0, 8)
    : [];

  const choose = (r: ChatRef) => {
    if (!open) return;
    const token = `${tokenOf(r)} `;
    const next = draft.slice(0, open.start) + token + draft.slice(caret);
    const pos = open.start + token.length;
    setDraft(next);
    setCaret(pos);
    setPicked(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const insertSymbol = (sym: string) => {
    const el = inputRef.current;
    const at = el?.selectionStart ?? draft.length;
    const pad = at > 0 && !/\s/.test(draft[at - 1]) ? " " : "";
    const next = draft.slice(0, at) + pad + sym + draft.slice(at);
    const pos = at + pad.length + sym.length;
    setDraft(next);
    setCaret(pos);
    setClosedAt(null);
    setPicked(0);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

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
    const next: Message[] = [...messages, { role: "user", text: text.trim(), ai: expandRefs(text.trim(), refs) }];
    setMessages(next);
    setDraft("");
    start(async () => {
      // mensagens de erro ficam só na tela, não voltam para a IA
      const history = next.filter((m) => !m.error).map(({ role, text, ai }) => ({ role, text: ai ?? text }));
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
        <p className="muted">Defina ANTHROPIC_API_KEY no servidor para usar o assistente.</p>
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
              <div className="chat-bubble">{m.role === "user" ? withChips(m.text) : m.text}</div>
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
        <div className="chat-compose">
          {open && (
            <ul className="chat-suggest" role="listbox">
              <li className="chat-suggest-head small faint">
                {TRIGGERS[open.symbol].name}s{open.query.trim() ? ` com “${open.query.trim()}”` : ""}
              </li>
              {options.length ? (
                options.map((r, i) => (
                  <li
                    key={r.id}
                    role="option"
                    aria-selected={i === picked}
                    className={i === picked ? "on" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(r);
                    }}
                    onMouseEnter={() => setPicked(i)}
                  >
                    <span>{r.label}</span>
                    {r.hint && <span className="small faint">{r.hint}</span>}
                  </li>
                ))
              ) : (
                <li className="small faint">Nada encontrado.</li>
              )}
            </ul>
          )}
          {/* camada atrás do textarea que pinta os itens citados como etiquetas */}
          <div ref={mirrorRef} className="chat-mirror" aria-hidden>
            {withChips(draft, "chat-mark")}
            {"\u200b"}
          </div>
          <textarea
            ref={inputRef}
            className="chat-field"
            placeholder="Escreva o pedido… use @ para citar uma pergunta, # classificação, $ escala, ! etapa"
            value={draft}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              setCaret(e.target.selectionStart);
              setPicked(0);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onBlur={() => q && setClosedAt(q.start)}
            onFocus={() => setClosedAt(null)}
            onKeyDown={(e) => {
              if (open && options.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const d = e.key === "ArrowDown" ? 1 : -1;
                  setPicked((p) => (p + d + options.length) % options.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  choose(options[Math.min(picked, options.length - 1)]);
                  return;
                }
              }
              // Backspace logo depois de um item citado apaga o item inteiro
              if (e.key === "Backspace" && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
                const at = e.currentTarget.selectionStart;
                const m = draft.slice(0, at).match(/[@#$!]\[[^\]]+\]$/);
                if (m) {
                  e.preventDefault();
                  const pos = at - m[0].length;
                  setDraft(draft.slice(0, pos) + draft.slice(at));
                  setCaret(pos);
                  requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos));
                  return;
                }
              }
              if (open && e.key === "Escape") {
                e.preventDefault();
                setClosedAt(open.start);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={2}
          />
        </div>
        <div className="chat-symbols small">
          <span className="faint">Citar itens do teste:</span>
          {Object.entries(TRIGGERS).map(([sym, t]) => (
            <button key={sym} type="button" className="chat-symbol" title={`ex.: ${t.example}`} disabled={pending} onClick={() => insertSymbol(sym)}>
              <span className="chat-symbol-key">{sym}</span>
              {t.name}
            </button>
          ))}
        </div>
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

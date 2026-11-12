"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClaudeMark } from "@/app/components/ClaudeMark";
import {
  listAssistantConversations,
  loadAssistantConversation,
  renameAssistantConversation,
  sendAssistantMessage,
  type AssistantTurn,
  type ConversationSummary,
} from "./assistant-actions";

// O Claude dentro do painel, como no miimo: um app em tela cheia no espírito do claude.ai, aberto pelo botão no canto.
// Barra lateral com as conversas; a conversa numa coluna de leitura; numa conversa nova, a saudação e a caixa no meio.
// As conversas ficam no servidor. Não há exclusão de nada, nem de conversa.

const SUGGESTIONS: Record<string, { label: string; text: string }[]> = {
  admin: [
    { label: "Escolas", text: "Quais escolas estão ativas e quais testes cada uma aplica?" },
    { label: "Cobertura do teste", text: "Quais classificações do KAY12 têm poucas perguntas ativas?" },
    { label: "Convidar", text: "Crie um convite de administrador para a escola " },
    { label: "Como funciona", text: "Como funciona o sorteio das perguntas?" },
  ],
  gestor: [
    { label: "Pendências", text: "Quais pacientes ainda não responderam o início do tratamento?" },
    { label: "Novo paciente", text: "Cadastre o paciente " },
    { label: "Equipe", text: "Quem está na minha equipe?" },
    { label: "Como funciona", text: "Como leio a análise da escola?" },
  ],
  terapeuta: [
    { label: "Meus pacientes", text: "Como estão os meus pacientes?" },
    { label: "Registrar sessão", text: "Registre uma sessão de hoje para " },
    { label: "Pendências", text: "Quais formulários estão pendentes?" },
    { label: "Resultados", text: "O que significam as faixas do resultado?" },
  ],
};

const greeting = () => {
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
};

const LAST = "assistant:last";

export function AssistantDock({ role, name }: { role: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [activeId, setActiveId] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [pendingText, setPendingText] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const active = list?.find((c) => c.id === activeId) ?? null;
  const shown: AssistantTurn[] = pendingText ? [...turns, { id: "pending", role: "user", text: pendingText, actions: [] }] : turns;
  const welcome = !activeId && !pendingText;
  const words = filter.trim().toLocaleLowerCase("pt-BR");
  const listed = useMemo(() => (words ? (list ?? []).filter((c) => c.title.toLocaleLowerCase("pt-BR").includes(words)) : (list ?? [])), [list, words]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // ao abrir pela primeira vez, traz as conversas e reabre a última
  useEffect(() => {
    if (!open || list) return;
    (async () => {
      const r = await listAssistantConversations();
      if (!r.ok) return setError(r.error);
      setList(r.data!);
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST);
      } catch {}
      if (last && r.data!.some((c) => c.id === last)) await show(last);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, activeId]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, sending, activeId]);
  // a caixa cresce com o texto, até algumas linhas
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text, welcome, open]);

  const remember = (id: string) => {
    try {
      if (id) localStorage.setItem(LAST, id);
      else localStorage.removeItem(LAST);
    } catch {}
  };

  async function show(id: string) {
    setActiveId(id);
    setTurns([]);
    setError("");
    setSideOpen(false);
    setLoading(true);
    const r = await loadAssistantConversation(id);
    setLoading(false);
    if (!r.ok) return setError(r.error);
    setTurns(r.data!.turns);
    remember(id);
  }

  const newConversation = () => {
    setActiveId("");
    setTurns([]);
    setPendingText("");
    setText("");
    setError("");
    setSideOpen(false);
    remember("");
    input.current?.focus();
  };

  const submit = () => {
    const said = text.trim();
    if (!said || sending) return;
    setText("");
    setError("");
    setPendingText(said);
    startSend(async () => {
      const r = await sendAssistantMessage(activeId || null, said);
      setPendingText("");
      if (!r.ok) {
        setError(r.error);
        setText(said);
        return;
      }
      setActiveId(r.data!.conversation.id);
      setTurns(r.data!.conversation.turns);
      setList(r.data!.conversations);
      remember(r.data!.conversation.id);
      if (r.data!.changed) router.refresh();
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const composer = (
    <form
      className={`cl-compose${welcome ? " is-large" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && (
        <p className="cl-error" role="alert">
          {error}
        </p>
      )}
      <div className="cl-compose__box">
        <textarea
          ref={input}
          rows={welcome ? 2 : 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={welcome ? "Como posso ajudar hoje?" : "Responder ao Claude…"}
          aria-label="Mensagem para o Claude"
        />
        <div className="cl-compose__actions">
          <span />
          <button type="submit" className="cl-send" aria-label="Enviar" disabled={!text.trim() || sending}>
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <>
      <button type="button" className="assistant-launcher" aria-label="Abrir Claude" title="Claude" onClick={() => setOpen(true)}>
        <ClaudeMark />
      </button>
      <dialog
        ref={dialogRef}
        className="cl"
        aria-label="Claude"
        onCancel={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          if (sideOpen) setSideOpen(false);
          else setOpen(false);
        }}
      >
        {open && (
          <div className={`cl-app${sideOpen ? " is-side-open" : ""}`}>
            <aside className="cl-side">
              <div className="cl-side__head">
                <ClaudeMark />
                <strong>Claude</strong>
                <button type="button" className="cl-icon cl-only-mobile" aria-label="Fechar menu" onClick={() => setSideOpen(false)}>
                  <CloseIcon />
                </button>
              </div>
              <button type="button" className="cl-new" onClick={newConversation}>
                <span>
                  <PlusIcon />
                </span>
                Nova conversa
              </button>
              <label className="cl-search">
                <SearchIcon />
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar conversas" aria-label="Buscar conversas" />
              </label>
              <p className="cl-side__label">Recentes</p>
              <nav className="cl-list" aria-label="Conversas">
                {listed.map((c) =>
                  renaming === c.id ? (
                    <RenameField
                      key={c.id}
                      title={c.title}
                      onDone={async (title) => {
                        setRenaming("");
                        if (!title || title === c.title) return;
                        const r = await renameAssistantConversation(c.id, title);
                        if (r.ok) setList(r.data!);
                      }}
                    />
                  ) : (
                    <div key={c.id} className={`cl-list__item${c.id === activeId ? " is-active" : ""}`}>
                      <button type="button" className="cl-list__open" onClick={() => show(c.id)} onDoubleClick={() => setRenaming(c.id)} title={`${c.title} (clique duas vezes para renomear)`}>
                        {c.title}
                      </button>
                    </div>
                  ),
                )}
                {list && !list.length && <p className="cl-side__empty">Suas conversas aparecem aqui.</p>}
                {list && list.length > 0 && !listed.length && <p className="cl-side__empty">Nenhuma conversa com esse nome.</p>}
              </nav>
              <div className="cl-side__foot">
                <span className="cl-avatar" aria-hidden="true">
                  {name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="cl-side__name">{name}</span>
              </div>
            </aside>
            <div className="cl-scrim" onClick={() => setSideOpen(false)} />

            <main className="cl-main">
              <header className="cl-top">
                <button type="button" className="cl-icon cl-only-mobile" aria-label="Abrir conversas" onClick={() => setSideOpen(true)}>
                  <MenuIcon />
                </button>
                <span className="cl-top__title">{active?.title ?? ""}</span>
                <button type="button" className="cl-icon cl-only-mobile" aria-label="Nova conversa" onClick={newConversation}>
                  <PlusIcon />
                </button>
                <button type="button" className="cl-icon" aria-label="Fechar Claude" onClick={() => setOpen(false)}>
                  <CloseIcon />
                </button>
              </header>

              {welcome ? (
                <div className="cl-welcome">
                  <h1>
                    <ClaudeMark /> {greeting()}, {name.split(" ")[0]}
                  </h1>
                  {composer}
                  <div className="cl-chips">
                    {(SUGGESTIONS[role] ?? SUGGESTIONS.terapeuta).map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => {
                          setText(s.text);
                          input.current?.focus();
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="cl-hint">Faz pela conversa o que a plataforma faz, com as permissões do seu papel, e explica qualquer parte do Skiller. Exclusões continuam na plataforma.</p>
                </div>
              ) : (
                <>
                  <div className="cl-thread" ref={scroller}>
                    <div className="cl-column">
                      {loading ? <p className="cl-blank">Carregando…</p> : shown.map((t) => <Turn key={t.id} turn={t} />)}
                      {sending && (
                        <div className="cl-thinking" aria-live="polite">
                          <ClaudeMark />
                          <span>Pensando…</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cl-bottom">
                    {composer}
                    <p className="cl-foot">O Claude pode errar. Confira os dados importantes.</p>
                  </div>
                </>
              )}
            </main>
          </div>
        )}
      </dialog>
    </>
  );
}

function Turn({ turn }: { turn: AssistantTurn }) {
  if (turn.role === "user")
    return (
      <div className="cl-turn cl-turn--user">
        <p>{turn.text}</p>
      </div>
    );
  // o que foi feito vai numa linha discreta acima da resposta: alterações e falhas nomeadas, consultas contadas
  const changes = turn.actions.filter((a) => a.write || !a.ok);
  const reads = turn.actions.length - changes.length;
  const line = [...changes.map((a) => `${a.ok ? "✓" : "✕"} ${a.label}`), ...(reads ? [reads === 1 ? "1 consulta" : `${reads} consultas`] : [])];
  return (
    <div className="cl-turn cl-turn--assistant">
      {turn.actions.length > 0 && (
        <details className="cl-actions">
          <summary>{line.join(" · ")}</summary>
          <ul>
            {turn.actions.map((a, i) => (
              <li key={i} className={a.ok ? "is-ok" : "is-failed"}>
                {a.ok ? "✓" : "✕"} {a.label}
                {a.ok ? "" : " (não deu certo)"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {turn.text && <Markdown text={turn.text} />}
    </div>
  );
}

function RenameField({ title, onDone }: { title: string; onDone: (title: string) => void }) {
  const [value, setValue] = useState(title);
  return (
    <input
      className="cl-rename"
      autoFocus
      value={value}
      aria-label="Nome da conversa"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim());
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onDone(title);
        }
      }}
    />
  );
}

/** Markdown da resposta: títulos, listas, citações, código, **negrito**, *itálico*, `código` e links. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      blocks.push(
        <pre key={blocks.length}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 2, 6)}` as "h3";
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={blocks.length} />);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      i--;
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) quote.push(lines[i].replace(/^>\s?/, ""));
      i--;
      blocks.push(<blockquote key={blocks.length}>{inline(quote.join(" "))}</blockquote>);
      continue;
    }
    const paragraph: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]); i++) paragraph.push(lines[i]);
    i--;
    blocks.push(
      <p key={blocks.length}>
        {paragraph.map((it, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(it)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="cl-markdown">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\))/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={parts.length}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\((.+)\)$/)!;
      parts.push(
        <a key={parts.length} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
          {label}
        </a>,
      );
    } else parts.push(<em key={parts.length}>{token.slice(1, -1)}</em>);
    last = m.index! + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const SearchIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...line}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...line}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);
const MenuIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...line}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...line}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);
const SendIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...line} strokeWidth={1.7}>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </svg>
);

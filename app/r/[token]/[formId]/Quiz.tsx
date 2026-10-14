"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { finishForm, saveAnswer } from "@/app/r/actions";

export type QuizItem = {
  text: string;
  block: number;
  options: { id: string; label: string; description: string; symbol: string }[];
};

export function Quiz({
  token,
  formId,
  name,
  items,
  blocks,
  initialAnswers,
}: {
  token: string;
  formId: string;
  name: string;
  items: QuizItem[];
  blocks: string[];
  initialAnswers: Record<string, string>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initialAnswers);
  const firstOpen = items.findIndex((_, i) => !(i in initialAnswers));
  const [index, setIndex] = useState(firstOpen === -1 ? items.length : firstOpen);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const done = Object.keys(answers).length;
  const reviewing = index >= items.length;
  const item = items[Math.min(index, items.length - 1)];
  const blockStart = index === 0 || items[index - 1]?.block !== item.block;

  // Cronômetro da pergunta na tela: não conta o tempo com a aba escondida.
  const timer = useRef({ acc: 0, since: 0 as number | null });
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    // começa a contar ao mostrar a pergunta; só desconta quando o navegador avisa que a aba foi escondida
    timer.current = { acc: 0, since: performance.now() };
  }, [index]);

  useEffect(() => {
    function onVisibility() {
      const t = timer.current;
      if (document.hidden && t.since !== null) {
        t.acc += performance.now() - t.since;
        t.since = null;
      } else if (!document.hidden && t.since === null) {
        t.since = performance.now();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function takeElapsed() {
    const t = timer.current;
    const now = performance.now();
    const ms = t.acc + (t.since !== null ? now - t.since : 0);
    // quem acabou de responder está com a tela à vista
    timer.current = { acc: 0, since: now };
    return ms;
  }

  function choose(optionId: string) {
    const i = index;
    const elapsed = takeElapsed();
    setAnswers((a) => ({ ...a, [i]: optionId }));
    setError("");
    setTimeout(() => setIndex((cur) => (cur === i ? i + 1 : cur)), 220);
    startTransition(async () => {
      try {
        await saveAnswer(token, formId, i, optionId, elapsed);
      } catch {
        setError("Não foi possível salvar esta resposta. Verifique a conexão e tente de novo.");
        setAnswers((a) => {
          const next = { ...a };
          delete next[i];
          return next;
        });
        setIndex(i);
      }
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (reviewing || e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (e.key.length === 1 && Number.isInteger(n) && n >= 1 && n <= item.options.length) choose(item.options[n - 1].id);
      if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
      if (e.key === "ArrowRight" && index in answers) setIndex(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function finish() {
    startTransition(async () => {
      try {
        await finishForm(token, formId);
        router.refresh();
      } catch {
        setError("Ainda há perguntas sem resposta.");
        const missing = items.findIndex((_, i) => !(i in answers));
        if (missing >= 0) setIndex(missing);
      }
    });
  }

  return (
    <div className="stack">
      <div className="row spread">
        <a href={`/r/${token}`} className="hand" style={{ textDecoration: "none" }}>
          olá, {name.split(" ")[0]}
        </a>
        <span className="faint">
          {done} de {items.length}
        </span>
      </div>
      <div className="progress" aria-hidden>
        <span style={{ width: `${(done / items.length) * 100}%` }} />
      </div>

      {reviewing ? (
        <div className="card quiz-card">
          <h2>Tudo respondido</h2>
          <p className="muted">Você pode voltar e revisar antes de enviar. Depois do envio, não será possível alterar.</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
            <button className="btn ghost" onClick={() => setIndex(items.length - 1)}>
              Revisar
            </button>
            <button className="btn warm lg" onClick={finish} disabled={pending || done < items.length}>
              {pending ? "Enviando…" : "Enviar respostas"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <>
          {blockStart && blocks[item.block] && <p className="block-instruction">{blocks[item.block]}</p>}
          <div className="card quiz-card" key={index}>
            <p className="quiz-statement">{item.text}</p>
            <div className="scale" role="radiogroup" aria-label="Respostas" style={{ "--n": item.options.length } as CSSProperties}>
              {item.options.map((o, k) => {
                const selected = answers[index] === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`scale-opt${selected ? " selected" : ""}`}
                    onClick={() => choose(o.id)}
                  >
                    <span className="scale-num">{k + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="symbol scale-symbol" src={o.symbol} width={72} height={72} alt="" />
                    <span className="scale-text">
                      <span className="scale-label">{o.label}</span>
                      {o.description && <span className="scale-desc">{o.description}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
            <div className="row spread" style={{ marginTop: 20 }}>
              <button className="btn ghost sm" onClick={() => setIndex(index - 1)} disabled={index === 0}>
                ← Anterior
              </button>
              <span className="faint kbd-hint">use as teclas 1–{item.options.length}</span>
              <button className="btn ghost sm" onClick={() => setIndex(index + 1)} disabled={!(index in answers)}>
                Próxima →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { Result } from "@/lib/result";
import type { RespondentRole, SymbolSource } from "@/lib/types";
import {
  deleteQuestion,
  freezeAutoSymbols,
  generateSymbol,
  moveQuestion,
  resetSymbol,
  saveQuestion,
  setManualSymbol,
  toggleQuestion,
  type QuestionInput,
} from "../../test-actions";

type Q = QuestionInput & { id: string; active: boolean; symbol: string; symbolSource?: SymbolSource; used: boolean };
type Opt = { id: string; name: string };

const TARGETS: { key: RespondentRole; label: string; short: string }[] = [
  { key: "paciente", label: "Paciente", short: "P" },
  { key: "responsavel", label: "Mãe/Pai", short: "R" },
  { key: "terapeuta", label: "Terapeuta", short: "T" },
];

export function QuestionsEditor({
  testId,
  questions,
  categories,
  scales,
  hasKey,
}: {
  testId: string;
  questions: Q[];
  categories: (Opt & { order: number })[];
  scales: Opt[];
  hasKey: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [cat, setCat] = useState("");
  const [target, setTarget] = useState<RespondentRole | "">("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; failed: number; total: number } | null>(null);

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.show(res.error);
      else if (res.message) toast.show(res.message);
      router.refresh();
    });

  async function genOne(id: string) {
    setBusy((b) => new Set(b).add(id));
    const res = await generateSymbol(testId, id);
    setBusy((b) => {
      const n = new Set(b);
      n.delete(id);
      return n;
    });
    return res;
  }

  async function generateMany(ids: string[]) {
    if (!ids.length) return toast.show("Nada para gerar.");
    let done = 0;
    let failed = 0;
    let lastError = "";
    const queue = [...ids];
    setBatch({ done, failed, total: ids.length });
    await Promise.all(
      Array.from({ length: Math.min(3, ids.length) }, async () => {
        while (queue.length) {
          const res = await genOne(queue.shift()!);
          if (res.ok) done++;
          else {
            failed++;
            lastError = res.error;
          }
          setBatch({ done, failed, total: ids.length });
        }
      }),
    );
    setBatch(null);
    toast.show(failed ? `${done} gerados, ${failed} com erro. Último erro: ${lastError}` : `${done} símbolos gerados.`);
    router.refresh();
  }

  const t = term.trim().toLowerCase();
  const visible = questions.filter((q) => (!cat || q.categoryId === cat) && (!target || q.targets.includes(target)) && (!t || q.text.toLowerCase().includes(t)));
  const missing = questions.filter((q) => q.symbolSource !== "ia" && q.symbolSource !== "manual").map((q) => q.id);
  const catName = new Map(categories.map((c) => [c.id, `${c.order}. ${c.name}`]));
  const scaleName = new Map(scales.map((s) => [s.id, s.name]));

  return (
    <div className="stack">
      {toast.node}

      {categories.length && scales.length ? (
        <details className="card alt">
          <summary>
            <strong>+ Nova pergunta</strong>
          </summary>
          <div style={{ marginTop: 14 }}>
            <QuestionForm
              categories={categories}
              scales={scales}
              initial={{ text: "", categoryId: cat || categories[0].id, scaleId: scales[0].id, targets: ["paciente", "responsavel", "terapeuta"], perspectives: ["si", "outro"], weight: 1 }}
              submitLabel="Adicionar pergunta"
              onSubmit={(data, reset) =>
                start(async () => {
                  const res = await saveQuestion(testId, null, data);
                  toast.show(res.ok ? res.message ?? "Adicionada." : res.error);
                  if (res.ok) reset();
                  router.refresh();
                })
              }
            />
          </div>
        </details>
      ) : (
        <p className="card muted">Cadastre ao menos uma classificação e uma escala de respostas antes de criar perguntas.</p>
      )}

      <div className="card">
        <div className="row">
          <input type="search" placeholder="Buscar…" value={term} onChange={(e) => setTerm(e.target.value)} style={{ flex: 2, minWidth: 180 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: 2, minWidth: 180 }} aria-label="Classificação">
            <option value="">Todas as classificações</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {catName.get(c.id)}
              </option>
            ))}
          </select>
          <select value={target} onChange={(e) => setTarget(e.target.value as RespondentRole | "")} style={{ flex: 1, minWidth: 150 }} aria-label="Para quem">
            <option value="">Para qualquer pessoa</option>
            {TARGETS.map((x) => (
              <option key={x.key} value={x.key}>
                Para: {x.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row spread" style={{ marginTop: 12 }}>
          <span className="faint">
            {visible.length} de {questions.length} perguntas · legenda: P = paciente, R = mãe/pai, T = terapeuta
          </span>
          <span className="row">
            <button className="btn sage sm" disabled={!hasKey || !!batch || pending} onClick={() => generateMany(missing)} title={hasKey ? "" : "Cadastre a chave em Configurações"}>
              ✦ Gerar símbolos faltantes ({missing.length})
            </button>
            {!hasKey && (
              <button className="btn ghost sm" onClick={() => run(() => freezeAutoSymbols(testId))}>
                Fixar símbolos automáticos
              </button>
            )}
          </span>
        </div>
        {batch && (
          <div style={{ marginTop: 10 }}>
            <div className="progress">
              <span style={{ width: `${((batch.done + batch.failed) / batch.total) * 100}%` }} />
            </div>
            <p className="faint">
              Gerando {batch.done + batch.failed} de {batch.total}…
            </p>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {visible.map((q, i) => (
            <QuestionRow
              key={q.id}
              q={q}
              categories={categories}
              scales={scales}
              catLabel={catName.get(q.categoryId) ?? ""}
              scaleLabel={scaleName.get(q.scaleId) ?? ""}
              first={i === 0 || visible[i - 1].categoryId !== q.categoryId}
              last={i === visible.length - 1 || visible[i + 1].categoryId !== q.categoryId}
              busy={busy.has(q.id)}
              hasKey={hasKey}
              disabled={pending || !!batch}
              run={run}
              onGenerate={async () => {
                const res = await genOne(q.id);
                toast.show(res.ok ? "Símbolo gerado." : res.error);
                router.refresh();
              }}
              testId={testId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionForm({
  categories,
  scales,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  categories: Opt[];
  scales: Opt[];
  initial: QuestionInput;
  submitLabel: string;
  onSubmit: (data: QuestionInput, reset: () => void) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(initial);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f, () => setF({ ...initial, categoryId: f.categoryId, scaleId: f.scaleId, targets: f.targets, perspectives: f.perspectives }));
      }}
    >
      <textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Texto da pergunta" required style={{ minHeight: 60 }} />
      <div className="grid-2" style={{ gap: 12 }}>
        <div>
          <label>Classificação</label>
          <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Respostas (escala)</label>
          <select value={f.scaleId} onChange={(e) => setF({ ...f, scaleId: e.target.value })}>
            {scales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Para quem</label>
          <div className="row" style={{ gap: 14 }}>
            {TARGETS.map((t) => (
              <label key={t.key} className="small" style={{ fontWeight: 400, margin: 0 }}>
                <input type="checkbox" checked={f.targets.includes(t.key)} onChange={() => setF({ ...f, targets: toggle(f.targets, t.key) })} /> {t.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label>Peso da pergunta</label>
          <input type="number" min={0.1} step={0.1} value={f.weight} onChange={(e) => setF({ ...f, weight: Number(e.target.value) })} style={{ maxWidth: 120 }} />
        </div>
        {f.targets.includes("paciente") && (
          <div>
            <label>O paciente pode responder</label>
            <div className="row" style={{ gap: 14 }}>
              <label className="small" style={{ fontWeight: 400, margin: 0 }}>
                <input type="checkbox" checked={f.perspectives.includes("si")} onChange={() => setF({ ...f, perspectives: toggle(f.perspectives, "si") })} /> sobre si
              </label>
              <label className="small" style={{ fontWeight: 400, margin: 0 }}>
                <input type="checkbox" checked={f.perspectives.includes("outro")} onChange={() => setF({ ...f, perspectives: toggle(f.perspectives, "outro") })} /> sobre o outro
              </label>
            </div>
          </div>
        )}
      </div>
      <div className="row">
        <button className="btn sm">{submitLabel}</button>
        {onCancel && (
          <button type="button" className="btn ghost sm" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function QuestionRow({
  q,
  testId,
  categories,
  scales,
  catLabel,
  scaleLabel,
  first,
  last,
  busy,
  hasKey,
  disabled,
  run,
  onGenerate,
}: {
  q: Q;
  testId: string;
  categories: Opt[];
  scales: Opt[];
  catLabel: string;
  scaleLabel: string;
  first: boolean;
  last: boolean;
  busy: boolean;
  hasKey: boolean;
  disabled: boolean;
  run: (fn: () => Promise<Result>) => void;
  onGenerate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [svg, setSvg] = useState("");

  return (
    <div className={`q-row${q.active ? "" : " inactive"}`}>
      <div style={{ flex: "none", opacity: busy ? 0.35 : 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="symbol" src={q.symbol} width={52} height={52} alt="" />
      </div>
      {editing ? (
        <div className="q-text stack">
          <QuestionForm
            categories={categories}
            scales={scales}
            initial={{ text: q.text, categoryId: q.categoryId, scaleId: q.scaleId, targets: q.targets, perspectives: q.perspectives, weight: q.weight }}
            submitLabel="Salvar"
            onCancel={() => setEditing(false)}
            onSubmit={(data) => {
              run(() => saveQuestion(testId, q.id, data));
              setEditing(false);
            }}
          />
          <details>
            <summary className="small">Símbolo manual (colar SVG)</summary>
            <textarea
              placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">…</svg>'
              value={svg}
              onChange={(e) => setSvg(e.target.value)}
              style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12 }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn ghost sm" disabled={!svg.trim()} onClick={() => run(() => setManualSymbol(testId, q.id, svg))}>
                Usar este SVG
              </button>
              <button className="btn ghost sm" onClick={() => run(() => resetSymbol(testId, q.id))}>
                Voltar ao automático
              </button>
            </div>
          </details>
        </div>
      ) : (
        <div className="q-text">
          <div>{q.text}</div>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <span className="faint">{catLabel}</span>
            {TARGETS.filter((t) => q.targets.includes(t.key)).map((t) => (
              <span key={t.key} className="pill" title={t.label}>
                {t.short}
              </span>
            ))}
            {q.targets.includes("paciente") && q.perspectives.length === 1 && <span className="pill">só {q.perspectives[0] === "si" ? "sobre si" : "sobre o outro"}</span>}
            {q.weight !== 1 && <span className="pill mid">peso {q.weight}</span>}
            <span className="faint">· {scaleLabel}</span>
            {q.symbolSource === "ia" && <span className="pill ia">símbolo IA</span>}
            {!q.active && <span className="pill low">inativa</span>}
          </div>
        </div>
      )}
      {!editing && (
        <div className="q-actions">
          <button className="btn ghost sm" disabled={!hasKey || busy || disabled} onClick={onGenerate} title="Gerar símbolo com IA">
            ✦
          </button>
          <button className="btn ghost sm" disabled={first || disabled} onClick={() => run(() => moveQuestion(testId, q.id, -1))} aria-label="Subir">
            ↑
          </button>
          <button className="btn ghost sm" disabled={last || disabled} onClick={() => run(() => moveQuestion(testId, q.id, 1))} aria-label="Descer">
            ↓
          </button>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="btn ghost sm" disabled={disabled} onClick={() => run(() => toggleQuestion(testId, q.id))}>
            {q.active ? "Desativar" : "Ativar"}
          </button>
          <button
            className="btn ghost sm danger"
            disabled={disabled}
            onClick={() => confirm(q.used ? "Esta pergunta já foi usada e será apenas desativada. Continuar?" : "Excluir esta pergunta?") && run(() => deleteQuestion(testId, q.id))}
          >
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}

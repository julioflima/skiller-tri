"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

type Cat = { id: string; name: string; order: number };
export type Weights = { categoryId: string; weight: number; skillWeights?: Record<string, number> };

const fmt = (n: number) => (n ? String(n).replace(".", ",") : "");
const parse = (s: string) => (s.trim() === "" ? 0 : Number(s.trim().replace(",", ".")));

/** Peso da pergunta numa habilidade: o da principal ou o das outras (0 = não conta). */
export const weightIn = (q: Weights, catId: string) => (catId === q.categoryId ? q.weight : q.skillWeights?.[catId] ?? 0);

/** Cabeçalho da matriz: uma coluna estreita por habilidade, com o nome na vertical. */
export function WeightHead({ categories, primary }: { categories: Cat[]; primary?: string }) {
  return (
    <>
      {categories.map((c) => (
        <th key={c.id} className={`wm-col${c.id === primary ? " primary" : ""}`} title={`${c.order}. ${c.name}`} scope="col">
          <span>{c.name}</span>
        </th>
      ))}
    </>
  );
}

/**
 * Célula de peso. Aceita vírgula; vazio = 0. Setas ↑/↓ e Enter andam entre as linhas, ←/→ entre as colunas
 * (nas pontas do texto), como numa planilha.
 */
export function WeightCell({
  value,
  primary,
  max,
  onChange,
  label,
}: {
  value: number;
  primary: boolean;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(fmt(value));
  useEffect(() => setDraft(fmt(value)), [value]);
  const invalid = !Number.isFinite(parse(draft)) || parse(draft) < 0 || (primary && parse(draft) <= 0);
  const heat = value > 0 && max > 0 ? Math.min(value / max, 1) : 0;

  return (
    <td className={`wm-cell${primary ? " primary" : ""}${invalid ? " invalid" : ""}`}>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={primary ? "?" : "·"}
        aria-label={label}
        title={primary ? `${label} (principal: precisa ser maior que zero)` : label}
        style={{ "--heat": heat } as React.CSSProperties}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parse(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        onBlur={() => setDraft(fmt(value))}
        onKeyDown={moveFocus}
      />
    </td>
  );
}

function moveFocus(e: KeyboardEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const td = input.closest("td");
  const tr = td?.closest("tr");
  if (!td || !tr) return;
  const col = [...tr.children].indexOf(td);
  const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
  const atEnd = input.selectionStart === input.value.length;
  let target: Element | null | undefined;
  if (e.key === "ArrowDown" || e.key === "Enter") target = tr.nextElementSibling?.children[col];
  else if (e.key === "ArrowUp") target = tr.previousElementSibling?.children[col];
  else if (e.key === "ArrowLeft" && atStart) target = td.previousElementSibling;
  else if (e.key === "ArrowRight" && atEnd) target = td.nextElementSibling;
  else return;
  const next = target?.querySelector("input");
  if (next) {
    e.preventDefault();
    next.focus();
  } else if (e.key === "Enter") e.preventDefault();
}

/** A matriz de uma pergunta só, enfileirada (uma habilidade por linha), usada no formulário da pergunta. */
export function WeightRow({ categories, q, onChange }: { categories: Cat[]; q: Weights; onChange: (catId: string, n: number) => void }) {
  const max = Math.max(1, ...categories.map((c) => weightIn(q, c.id)));
  return (
    <table className="wm wm-list">
      <tbody>
        {categories.map((c) => {
          const primary = c.id === q.categoryId;
          return (
            <tr key={c.id} className={primary ? "primary" : ""}>
              <th scope="row">
                {c.name}
                {primary && <span className="faint"> · principal</span>}
              </th>
              <WeightCell value={weightIn(q, c.id)} primary={primary} max={max} label={c.name} onChange={(n) => onChange(c.id, n)} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Aplica o peso de uma habilidade numa pergunta (principal ou outra). */
export function withWeight<T extends Weights>(q: T, catId: string, n: number): T {
  if (catId === q.categoryId) return { ...q, weight: n };
  return { ...q, skillWeights: { ...q.skillWeights, [catId]: n } };
}

type MQ = Weights & { id: string; text: string; active: boolean };

/**
 * Matriz de pesos: perguntas nas linhas, habilidades nas colunas. As alterações ficam pendentes até "Salvar";
 * o rodapé mostra quantas perguntas contam em cada habilidade, para ver o equilíbrio do teste.
 */
export function WeightsMatrix({
  categories,
  questions,
  pending,
  onSave,
}: {
  categories: Cat[];
  questions: MQ[];
  pending: boolean;
  onSave: (rows: { id: string; weight: number; skillWeights: Record<string, number> }[], done: () => void) => void;
}) {
  const [edits, setEdits] = useState<Record<string, MQ>>({});
  const rows = questions.map((q) => edits[q.id] ?? q);
  const dirty = Object.values(edits);
  const bad = dirty.filter((q) => !(q.weight > 0));
  const max = Math.max(1, ...rows.flatMap((q) => categories.map((c) => weightIn(q, c.id))));

  const save = () =>
    onSave(
      dirty.map((q) => ({ id: q.id, weight: q.weight, skillWeights: q.skillWeights ?? {} })),
      () => setEdits({}),
    );

  return (
    <div>
      <div className="table-wrap wm-wrap">
        <table className="wm">
          <thead>
            <tr>
              <th className="wm-q" scope="col">
                Pergunta
              </th>
              <WeightHead categories={categories} />
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id} className={`${q.active ? "" : "inactive"}${edits[q.id] ? " dirty" : ""}`}>
                <th className="wm-q" scope="row" title={q.text}>
                  <span>{q.text}</span>
                </th>
                {categories.map((c) => (
                  <WeightCell
                    key={c.id}
                    value={weightIn(q, c.id)}
                    primary={c.id === q.categoryId}
                    max={max}
                    label={`${c.name} — ${q.text}`}
                    onChange={(n) => setEdits((e) => ({ ...e, [q.id]: withWeight(e[q.id] ?? q, c.id, n) }))}
                  />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="wm-q" scope="row">
                Perguntas que contam
              </th>
              {categories.map((c) => (
                <td key={c.id} className="wm-total">
                  {rows.filter((q) => weightIn(q, c.id) > 0).length}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="faint" style={{ marginTop: 10 }}>
        Célula com contorno = classificação principal (onde a pergunta aparece e é sorteada; precisa de peso maior que zero). Vazio = não conta.
        Aceita vírgula; ↑ ↓ e Enter andam entre as perguntas.
      </p>
      {dirty.length > 0 && (
        <div className="wm-bar">
          <span>
            {dirty.length === 1 ? "1 pergunta alterada" : `${dirty.length} perguntas alteradas`}
            {bad.length > 0 && <span className="error"> · a principal precisa de peso maior que zero</span>}
          </span>
          <button type="button" className="btn ghost sm" disabled={pending} onClick={() => setEdits({})}>
            Descartar
          </button>
          <button type="button" className="btn sm" disabled={pending || bad.length > 0} onClick={save}>
            Salvar pesos
          </button>
        </div>
      )}
    </div>
  );
}

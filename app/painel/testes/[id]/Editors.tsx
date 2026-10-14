"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { Result } from "@/lib/result";
import type { About, Category, RespondentRole, Scale, Stage, StageRule } from "@/lib/types";
import { deleteCategory, deleteScale, deleteStage, deleteTest, moveCategory, saveCategory, saveScale, saveStage, updateTestMeta } from "../../test-actions";

function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.show(res.error);
      if (res.message) toast.show(res.message);
      onOk?.();
      router.refresh();
    });
  return { run, pending, toast, router };
}

// ---------------- classificações ----------------

export function CategoriesEditor({ testId, categories }: { testId: string; categories: (Category & { questions: number })[] }) {
  const { run, pending, toast } = useRunner();
  const [name, setName] = useState("");
  return (
    <div className="stack">
      {toast.node}
      <section className="card">
        <p className="muted small">A classificação agrupa as perguntas no resultado (ex.: cada uma das 12 habilidades). Ela nunca aparece para quem responde.</p>
        {categories.map((c, i) => (
          <CategoryRow key={c.id} testId={testId} c={c} first={i === 0} last={i === categories.length - 1} run={run} pending={pending} />
        ))}
      </section>
      <form
        className="card alt row"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveCategory(testId, null, name, ""), () => setName(""));
        }}
      >
        <input type="text" placeholder="Nova classificação" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn warm" disabled={!name.trim() || pending}>
          + Adicionar
        </button>
      </form>
    </div>
  );
}

function CategoryRow({
  testId,
  c,
  first,
  last,
  run,
  pending,
}: {
  testId: string;
  c: Category & { questions: number };
  first: boolean;
  last: boolean;
  run: ReturnType<typeof useRunner>["run"];
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description);
  return (
    <div className="q-row">
      {editing ? (
        <div className="q-text stack">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (aparece no relatório)" />
          <div className="row">
            <button className="btn sm" onClick={() => run(() => saveCategory(testId, c.id, name, desc), () => setEditing(false))}>
              Salvar
            </button>
            <button className="btn ghost sm" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="q-text">
          <strong>
            <span className="faint">{c.order}.</span> {c.name}
          </strong>
          <div className="faint">
            {c.questions} pergunta(s){c.description ? ` · ${c.description}` : ""}
          </div>
        </div>
      )}
      {!editing && (
        <div className="q-actions">
          <button className="btn ghost sm" disabled={first || pending} onClick={() => run(() => moveCategory(testId, c.id, -1))} aria-label="Subir">
            ↑
          </button>
          <button className="btn ghost sm" disabled={last || pending} onClick={() => run(() => moveCategory(testId, c.id, 1))} aria-label="Descer">
            ↓
          </button>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="btn ghost sm danger" disabled={pending} onClick={() => confirm(`Excluir "${c.name}"?`) && run(() => deleteCategory(testId, c.id))}>
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- escalas de resposta ----------------

export function ScalesEditor({ testId, scales, usage }: { testId: string; scales: Scale[]; usage: Record<string, number> }) {
  const { toast } = useRunner();
  const blank: Scale = {
    id: "",
    name: "",
    options: [
      { id: "", label: "", description: "", weight: 0 },
      { id: "", label: "", description: "", weight: 1 },
    ],
  };
  return (
    <div className="stack">
      {toast.node}
      <p className="muted small" style={{ margin: 0 }}>
        Cada pergunta usa uma escala. O <strong>peso</strong> é o valor de cada resposta no cálculo. O resultado é normalizado entre o menor e o maior peso da escala,
        então escalas diferentes podem ser comparadas. Pesos podem ser invertidos (ex.: 4 → 0) para perguntas em sentido negativo.
      </p>
      {scales.map((s) => (
        <ScaleCard key={s.id} testId={testId} scale={s} used={usage[s.id] ?? 0} />
      ))}
      <ScaleCard testId={testId} scale={blank} used={0} isNew />
    </div>
  );
}

function ScaleCard({ testId, scale, used, isNew }: { testId: string; scale: Scale; used: number; isNew?: boolean }) {
  const { run, pending, toast } = useRunner();
  const [s, setS] = useState(scale);
  const [open, setOpen] = useState(!isNew);
  const setOpt = (i: number, patch: Partial<Scale["options"][number]>) => setS({ ...s, options: s.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  if (isNew && !open)
    return (
      <button className="btn ghost" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}>
        + Nova escala de respostas
      </button>
    );

  return (
    <section className="card">
      {toast.node}
      <div className="row spread">
        <input type="text" value={s.name} placeholder="Nome da escala" onChange={(e) => setS({ ...s, name: e.target.value })} style={{ flex: 1, minWidth: 220, fontWeight: 600 }} />
        {!isNew && <span className="faint">{used} pergunta(s) usam esta escala</span>}
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="scale-edit-row faint small">
          <span>Peso</span>
          <span>Resposta</span>
          <span>Descrição (opcional)</span>
          <span />
        </div>
        {s.options.map((o, i) => (
          <div key={i} className="scale-edit-row">
            <input type="number" step="any" value={o.weight} onChange={(e) => setOpt(i, { weight: Number(e.target.value) })} aria-label="Peso" />
            <input type="text" value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })} placeholder="Texto da resposta" aria-label="Resposta" />
            <input type="text" value={o.description} onChange={(e) => setOpt(i, { description: e.target.value })} placeholder="Explicação curta" aria-label="Descrição" />
            <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
              <button
                type="button"
                className="btn ghost sm"
                disabled={i === 0}
                onClick={() => {
                  const opts = [...s.options];
                  [opts[i - 1], opts[i]] = [opts[i], opts[i - 1]];
                  setS({ ...s, options: opts });
                }}
                aria-label="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn ghost sm danger"
                disabled={s.options.length <= 2}
                onClick={() => setS({ ...s, options: s.options.filter((_, j) => j !== i) })}
                aria-label="Remover resposta"
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setS({ ...s, options: [...s.options, { id: "", label: "", description: "", weight: (s.options.at(-1)?.weight ?? 0) + 1 }] })}
        >
          + Resposta
        </button>
        <span style={{ flex: 1 }} />
        {isNew && (
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        )}
        {!isNew && (
          <button type="button" className="btn ghost sm danger" disabled={pending || used > 0} onClick={() => confirm("Excluir esta escala?") && run(() => deleteScale(testId, s.id))}>
            Excluir
          </button>
        )}
        <button
          type="button"
          className="btn sm"
          disabled={pending}
          onClick={() =>
            run(
              () => saveScale(testId, s),
              () => {
                if (isNew) {
                  setS(scale);
                  setOpen(false);
                }
              },
            )
          }
        >
          Salvar escala
        </button>
      </div>
      {!isNew && used > 0 && <p className="faint" style={{ marginTop: 8 }}>Respostas já dadas guardam o peso da época; mudar os pesos vale para as próximas respostas.</p>}
    </section>
  );
}

// ---------------- etapas ----------------

const ROLE_OPTS: { value: RespondentRole; label: string }[] = [
  { value: "paciente", label: "Paciente" },
  { value: "responsavel", label: "Cada responsável (mãe/pai)" },
  { value: "terapeuta", label: "Terapeuta" },
];
const ABOUT_OPTS: Record<RespondentRole, { value: About; label: string }[]> = {
  paciente: [
    { value: "si", label: "sobre si" },
    { value: "outro", label: "sobre o outro" },
  ],
  responsavel: [{ value: "paciente", label: "sobre o paciente" }],
  terapeuta: [{ value: "paciente", label: "sobre o paciente" }],
};

export function StagesEditor({
  testId,
  stages,
  categories,
  poolSizes,
}: {
  testId: string;
  stages: Stage[];
  categories: { id: string; name: string }[];
  poolSizes: Record<string, number>;
}) {
  const blank: Stage = { id: "", name: "", kind: "sessao", rules: [] };
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        A etapa <strong>Início do tratamento</strong> é criada uma vez, quando o paciente é cadastrado (e quando um novo responsável é adicionado). As etapas do tipo
        <strong> Sessão</strong> são criadas sempre que o terapeuta registra uma sessão. Em cada regra, as perguntas são sorteadas entre as que servem para aquela
        pessoa, priorizando as que ela respondeu menos vezes e equilibrando as classificações.
      </p>
      {stages.map((s) => (
        <StageCard key={s.id} testId={testId} stage={s} categories={categories} poolSizes={poolSizes} />
      ))}
      {adding ? (
        <StageCard testId={testId} stage={blank} categories={categories} poolSizes={{}} onDone={() => setAdding(false)} />
      ) : (
        <button className="btn ghost" onClick={() => setAdding(true)} style={{ alignSelf: "flex-start" }}>
          + Nova etapa
        </button>
      )}
    </div>
  );
}

function StageCard({
  testId,
  stage,
  categories,
  poolSizes,
  onDone,
}: {
  testId: string;
  stage: Stage;
  categories: { id: string; name: string }[];
  poolSizes: Record<string, number>;
  onDone?: () => void;
}) {
  const { run, pending, toast } = useRunner();
  const [s, setS] = useState(stage);
  const isNew = !stage.id;
  const setRule = (i: number, patch: Partial<StageRule>) => setS({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <section className="card">
      {toast.node}
      <div className="row">
        <input type="text" value={s.name} placeholder="Nome da etapa" onChange={(e) => setS({ ...s, name: e.target.value })} style={{ flex: 2, minWidth: 200, fontWeight: 600 }} />
        <select value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value as Stage["kind"] })} style={{ flex: 1, minWidth: 200 }} aria-label="Quando acontece">
          <option value="inicial">Uma vez, no início do tratamento</option>
          <option value="sessao">A cada sessão</option>
        </select>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {s.rules.length === 0 && <p className="faint">Nenhuma regra ainda. Adicione quem responde e quantas perguntas.</p>}
        {s.rules.map((r, i) => {
          const pool = poolSizes[r.id];
          return (
            <div key={i} className="rule-card">
              <div className="row">
                <select
                  value={r.role}
                  onChange={(e) => {
                    const role = e.target.value as RespondentRole;
                    setRule(i, { role, about: ABOUT_OPTS[role][0].value });
                  }}
                  style={{ flex: 2, minWidth: 190 }}
                  aria-label="Quem responde"
                >
                  {ROLE_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="small">responde</span>
                <input type="number" min={1} value={r.count} onChange={(e) => setRule(i, { count: Number(e.target.value) })} style={{ width: 80 }} aria-label="Quantidade" />
                <span className="small">perguntas</span>
                <select value={r.about} onChange={(e) => setRule(i, { about: e.target.value as About })} style={{ flex: 1, minWidth: 150 }} aria-label="Sobre quem">
                  {ABOUT_OPTS[r.role].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn ghost sm danger" onClick={() => setS({ ...s, rules: s.rules.filter((_, j) => j !== i) })} aria-label="Remover regra">
                  ×
                </button>
              </div>
              <input
                type="text"
                value={r.instruction}
                onChange={(e) => setRule(i, { instruction: e.target.value })}
                placeholder="Instrução mostrada antes das perguntas. Use {paciente} para o nome."
                style={{ marginTop: 8 }}
                aria-label="Instrução"
              />
              <details style={{ marginTop: 8 }}>
                <summary className="small">
                  Classificações: {r.categoryIds.length ? `${r.categoryIds.length} selecionada(s)` : "todas"}
                  {pool !== undefined && (
                    <span className={pool < r.count ? "error" : "faint"}>
                      {" "}
                      · {pool} pergunta(s) disponíveis{pool < r.count ? ": menos que o pedido" : ""}
                    </span>
                  )}
                </summary>
                <div className="row" style={{ gap: 10, marginTop: 8 }}>
                  {categories.map((c) => (
                    <label key={c.id} className="small" style={{ fontWeight: 400, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={r.categoryIds.includes(c.id)}
                        onChange={() =>
                          setRule(i, { categoryIds: r.categoryIds.includes(c.id) ? r.categoryIds.filter((x) => x !== c.id) : [...r.categoryIds, c.id] })
                        }
                      />{" "}
                      {c.name}
                    </label>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setS({ ...s, rules: [...s.rules, { id: "", role: "paciente", count: 5, about: "si", categoryIds: [], instruction: "" }] })}
        >
          + Regra
        </button>
        <span style={{ flex: 1 }} />
        {isNew ? (
          <button type="button" className="btn ghost sm" onClick={onDone}>
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm danger"
            disabled={pending}
            onClick={() => confirm(`Excluir a etapa "${stage.name}"?`) && run(() => deleteStage(testId, stage.id))}
          >
            Excluir etapa
          </button>
        )}
        <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => saveStage(testId, s), onDone)}>
          Salvar etapa
        </button>
      </div>
      <p className="faint" style={{ marginTop: 8 }}>
        Mudanças valem para os próximos formulários; os já criados não mudam.
      </p>
    </section>
  );
}

// ---------------- dados do teste ----------------

export function TestMetaEditor({ test, patients }: { test: { id: string; name: string; description: string; active: boolean }; patients: number }) {
  const { run, pending, toast, router } = useRunner();
  const [f, setF] = useState(test);
  return (
    <section className="card stack">
      {toast.node}
      <div>
        <label>Nome</label>
        <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div>
        <label>Descrição</label>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <label className="small" style={{ fontWeight: 400 }}>
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo (disponível para novos pacientes)
      </label>
      <div className="row">
        <button className="btn" disabled={pending} onClick={() => run(() => updateTestMeta(test.id, f.name, f.description, f.active))}>
          Salvar
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="btn ghost sm danger"
          disabled={pending || patients > 0}
          title={patients ? "Há pacientes usando este teste" : ""}
          onClick={() => confirm("Excluir este teste definitivamente?") && run(() => deleteTest(test.id), () => router.push("/painel/testes"))}
        >
          Excluir teste
        </button>
      </div>
    </section>
  );
}

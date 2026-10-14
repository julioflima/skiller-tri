"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useToast } from "@/app/components/useToast";
import type { Result } from "@/lib/result";
import type { About, Category, RespondentRole, Scale, Stage, StageRule, TestLanding } from "@/lib/types";
import {
  deleteCategory,
  deleteScale,
  deleteStage,
  deleteTest,
  generateScaleSymbols,
  moveCategory,
  resetSymbol,
  saveCategory,
  saveScale,
  saveStage,
  saveLanding,
  uploadLandingImage,
  setManualSymbol,
  updateTestMeta,
} from "../../test-actions";

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

export function ScalesEditor({
  testId,
  scales,
  symbols,
  usage,
  hasKey,
}: {
  testId: string;
  scales: Scale[];
  /** Imagem do símbolo de cada resposta, por id da resposta. */
  symbols: Record<string, string>;
  usage: Record<string, number>;
  hasKey: boolean;
}) {
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
        Cada resposta tem um <strong>símbolo</strong>, mostrado no cartão em que a pessoa toca para responder.
      </p>
      {scales.map((s) => (
        <ScaleCard key={s.id} testId={testId} scale={s} symbols={symbols} used={usage[s.id] ?? 0} hasKey={hasKey} />
      ))}
      <ScaleCard testId={testId} scale={blank} symbols={symbols} used={0} hasKey={hasKey} isNew />
    </div>
  );
}

function ScaleCard({
  testId,
  scale,
  symbols,
  used,
  hasKey,
  isNew,
}: {
  testId: string;
  scale: Scale;
  symbols: Record<string, string>;
  used: number;
  hasKey: boolean;
  isNew?: boolean;
}) {
  const { run, pending, toast } = useRunner();
  const [s, setS] = useState(scale);
  const [manual, setManual] = useState({ optionId: scale.options[0]?.id ?? "", svg: "" });
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
          <span>Símbolo</span>
          <span>Peso</span>
          <span>Resposta</span>
          <span>Descrição (opcional)</span>
          <span />
        </div>
        {s.options.map((o, i) => (
          <div key={i} className="scale-edit-row">
            {/* respostas ainda não salvas ganham símbolo ao salvar a escala */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {symbols[o.id] ? <img className="symbol" src={symbols[o.id]} width={44} height={44} alt="" /> : <span className="faint small">—</span>}
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
        {!isNew && (
          <button
            type="button"
            className="btn sage sm"
            disabled={!hasKey || pending}
            title={hasKey ? "Gera os símbolos de todas as respostas desta escala" : "Defina ANTHROPIC_API_KEY no servidor"}
            onClick={() => run(() => generateScaleSymbols(testId, s.id))}
          >
            {pending ? "Gerando…" : "✦ Gerar símbolos com IA"}
          </button>
        )}
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
      {!isNew && (
        <details style={{ marginTop: 10 }}>
          <summary className="small">Símbolo manual de uma resposta (colar SVG)</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <select value={manual.optionId} onChange={(e) => setManual({ ...manual, optionId: e.target.value })} aria-label="Resposta">
              {scale.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {o.symbolSource ? ` (${o.symbolSource === "ia" ? "IA" : "manual"})` : " (automático)"}
                </option>
              ))}
            </select>
            <textarea
              placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">…</svg>'
              value={manual.svg}
              onChange={(e) => setManual({ ...manual, svg: e.target.value })}
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
            <div className="row">
              <button type="button" className="btn ghost sm" disabled={!manual.svg.trim() || pending} onClick={() => run(() => setManualSymbol(testId, s.id, manual.optionId, manual.svg))}>
                Usar este SVG
              </button>
              <button type="button" className="btn ghost sm" disabled={pending} onClick={() => run(() => resetSymbol(testId, s.id, manual.optionId))}>
                Voltar ao automático
              </button>
            </div>
          </div>
        </details>
      )}
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

export function TestMetaEditor({
  test,
  defaultSymbolPrompt,
}: {
  test: { id: string; name: string; description: string; active: boolean; symbolPrompt: string };
  defaultSymbolPrompt: string;
}) {
  const { run, pending, toast } = useRunner();
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
      <div>
        <div className="row spread">
          <label htmlFor="symbolPrompt">Instruções para os símbolos</label>
          {f.symbolPrompt !== defaultSymbolPrompt && (
            <button type="button" className="btn ghost sm" onClick={() => setF({ ...f, symbolPrompt: defaultSymbolPrompt })}>
              Restaurar padrão
            </button>
          )}
        </div>
        <textarea id="symbolPrompt" value={f.symbolPrompt} onChange={(e) => setF({ ...f, symbolPrompt: e.target.value })} style={{ minHeight: 220 }} />
        <p className="faint">Usadas pela IA ao desenhar os símbolos das perguntas deste teste. As regras de formato do SVG são adicionadas automaticamente.</p>
      </div>
      <div className="row">
        <button className="btn" disabled={pending} onClick={() => run(() => updateTestMeta(test.id, f.name, f.description, f.active, f.symbolPrompt))}>
          Salvar
        </button>
      </div>
    </section>
  );
}


/** Arquivar o teste em duas confirmações: primeiro o que muda, depois a senha de quem arquiva. */
export function ArchiveTestSection({ testId, name, patients, forms }: { testId: string; name: string; patients: number; forms: number }) {
  const { run, pending, toast, router } = useRunner();
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const close = () => {
    ref.current?.close();
    setStep(1);
    setPassword("");
  };
  return (
    <section className="card stack">
      {toast.node}
      <h2 style={{ margin: 0 }}>Arquivar teste</h2>
      <p className="muted" style={{ margin: 0 }}>
        O teste sai do painel, das escolas e da landing, e os pacientes que o usam são arquivados com o histórico guardado. Dá para restaurar
        depois na aba Arquivo da lista de testes.
      </p>
      <div>
        <button type="button" className="btn ghost danger" onClick={() => ref.current?.showModal()}>
          Arquivar teste
        </button>
      </div>
      <dialog ref={ref} className="qr-dialog" onClose={close}>
        {step === 1 ? (
          <>
            <h3 style={{ margin: 0 }}>Arquivar &quot;{name}&quot;?</h3>
            <p style={{ margin: 0 }}>
              O teste sai do painel, das escolas e da landing.{" "}
              {patients > 0 &&
                `${patients} paciente${patients > 1 ? "s" : ""} que o usa${patients > 1 ? "m" : ""} ser${patients > 1 ? "ão" : "á"} arquivado${patients > 1 ? "s" : ""}, com ${forms} formulário${forms === 1 ? "" : "s"} e as respostas guardados no histórico. `}
              Dá para restaurar depois na aba Arquivo da lista de testes.
            </p>
            <div className="row">
              <button type="button" className="btn danger" onClick={() => setStep(2)}>
                Sim, continuar
              </button>
              <button type="button" className="btn ghost" onClick={close}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => deleteTest(testId, password), () => {
                close();
                router.push("/painel/testes");
              });
            }}
          >
            <h3 style={{ margin: 0 }}>Confirme com sua senha</h3>
            <div>
              <label htmlFor="archive-test-pw">Senha</label>
              <input id="archive-test-pw" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="row">
              <button className="btn danger" disabled={pending || !password}>
                {pending ? "Arquivando…" : "Arquivar teste"}
              </button>
              <button type="button" className="btn ghost" onClick={close}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}

// ---------------- landing page ----------------

const LANDING_FIELDS: { key: keyof TestLanding; label: string; hint?: string; long?: boolean }[] = [
  { key: "slogan", label: "Frase acima do título", hint: "Opcional, em letra manuscrita." },
  { key: "headline", label: "Título" },
  { key: "lead", label: "Texto de abertura", long: true },
  { key: "skillsTitle", label: "Título da seção das classificações", hint: "Vazio = \"N classificações\"." },
  { key: "skillsLead", label: "Texto da seção das classificações", long: true },
];

/** Imagem da landing: enviada para a pasta do teste no storage; o endereço vai para o formulário e fica salvo com a landing. */
function ImageField({
  testId,
  kind,
  label,
  hint,
  value,
  onChange,
}: {
  testId: string;
  kind: "logo" | "destaque";
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const { pending, toast } = useRunner();
  const [uploading, setUploading] = useState(false);
  async function send(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    const res = await uploadLandingImage(testId, kind, form);
    setUploading(false);
    if (!res.ok) return toast.show(res.error);
    onChange(res.data!.url);
    toast.show(res.message ?? "Imagem enviada.");
  }
  return (
    <div>
      {toast.node}
      <span className="field-label">{label}</span>
      <div className="image-field">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" /> : <span className="faint small">Sem imagem</span>}
      </div>
      <div className="row tight" style={{ gap: 6, marginTop: 8 }}>
        <label className="btn ghost sm" style={{ display: "inline-flex", margin: 0, cursor: "pointer" }}>
          {uploading ? "Enviando…" : value ? "Trocar" : "Enviar"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            disabled={uploading || pending}
            onChange={(e) => {
              send(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {value && (
          <button type="button" className="btn ghost sm danger" onClick={() => onChange("")}>
            Remover
          </button>
        )}
      </div>
      <p className="faint">{hint} PNG, JPG, WEBP ou SVG, até 3 MB.</p>
    </div>
  );
}

export function LandingEditor({ testId, landing, suggestedSlug }: { testId: string; landing?: TestLanding; suggestedSlug: string }) {
  const { run, pending, toast } = useRunner();
  const [f, setF] = useState<TestLanding>(
    landing ?? {
      slug: suggestedSlug,
      published: false,
      slogan: "",
      headline: "",
      lead: "",
      skillsTitle: "",
      skillsLead: "",
      logoUrl: "",
      heroImageUrl: "",
      contactUrl: "",
    },
  );
  const path = `/teste/${f.slug}`;
  return (
    <section className="card stack">
      {toast.node}
      <p className="muted small" style={{ margin: 0 }}>
        Página pública do teste, para apresentá-lo a escolas e famílias. As classificações, quem responde e as etapas saem do próprio teste. Os
        testes publicados também aparecem na página inicial da plataforma.
      </p>
      <div className="grid-2" style={{ gap: 14 }}>
        <div>
          <label htmlFor="lp-slug">Endereço</label>
          <div className="row tight" style={{ gap: 6, flexWrap: "nowrap" }}>
            <span className="faint">/teste/</span>
            <input id="lp-slug" type="text" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </div>
        </div>
        <label className="small" style={{ fontWeight: 400, alignSelf: "end" }}>
          <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Publicada (qualquer pessoa com o
          endereço vê)
        </label>
      </div>
      <div className="grid-2" style={{ gap: 14 }}>
        <ImageField testId={testId} kind="logo" label="Logo" hint="Vazio = nome do teste em texto." value={f.logoUrl} onChange={(logoUrl) => setF({ ...f, logoUrl })} />
        <ImageField
          testId={testId}
          kind="destaque"
          label="Imagem de destaque"
          hint="Opcional. Aparece ao lado do título e no convite final."
          value={f.heroImageUrl}
          onChange={(heroImageUrl) => setF({ ...f, heroImageUrl })}
        />
      </div>
      {LANDING_FIELDS.map(({ key, label, hint, long }) => (
        <div key={key}>
          <label htmlFor={`lp-${key}`}>{label}</label>
          {long ? (
            <textarea id={`lp-${key}`} value={String(f[key])} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
          ) : (
            <input id={`lp-${key}`} type="text" value={String(f[key])} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
          )}
          {hint && <p className="faint">{hint}</p>}
        </div>
      ))}
      <div>
        <label htmlFor="lp-contact">WhatsApp do botão &quot;Falar com a equipe&quot;</label>
        <input
          id="lp-contact"
          type="text"
          inputMode="url"
          placeholder="https://wa.me/5511999999999?text=Olá! Vi a página do teste e quero saber mais."
          value={f.contactUrl}
          onChange={(e) => setF({ ...f, contactUrl: e.target.value })}
        />
        <p className="faint">https://wa.me/&lt;número&gt;?text=&lt;mensagem&gt; · número com DDI e DDD. Vazio = contato geral da plataforma.</p>
      </div>
      <div className="row">
        <button className="btn" disabled={pending} onClick={() => run(() => saveLanding(testId, f))}>
          Salvar
        </button>
        {landing ? (
          <a href={landing.published ? `/teste/${landing.slug}` : `/teste/${landing.slug}?previa=1`} target="_blank" rel="noreferrer" className="btn ghost sm">
            {landing.published ? "Ver landing page ↗" : "Ver prévia da landing ↗"}
          </a>
        ) : (
          <span className="faint">Salve para ver a landing page.</span>
        )}
        {landing && landing.slug !== f.slug && <span className="faint">O endereço muda para {path} ao salvar.</span>}
      </div>
    </section>
  );
}

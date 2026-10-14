/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import type { RespondentRole, Test } from "@/lib/types";
import { DemoEcomap, Dots, LP_COLORS, PlatformWordmark } from "@/app/components/LandingParts";
import "../../landing.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ previa?: string }> };

/** Publicada para todos; rascunho só como prévia para o administrador. */
async function findTest(slug: string, preview: boolean) {
  const db = await readDb();
  const test = db.tests.find((t) => t.landing?.slug === slug);
  if (!test?.landing) return null;
  if (test.landing.published && test.active) return test;
  const user = preview ? await currentUser() : null;
  return user?.role === "admin" ? test : null;
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const test = await findTest((await params).slug, !!(await searchParams).previa);
  if (!test?.landing) return {};
  return { title: `${test.name} · Skiller TRI`, description: test.landing.lead || test.description };
}

const ROLE_CARD: Record<RespondentRole, { title: string; color: string; text: (aboutOther: boolean) => string }> = {
  paciente: {
    title: "Quem é acompanhado",
    color: "var(--k-teal)",
    text: (aboutOther) =>
      `Responde sobre si${aboutOther ? " e sobre o outro" : ""}, num questionário curto, visual e sem senha, direto do celular.`,
  },
  responsavel: {
    title: "A família",
    color: "var(--k-yellow)",
    text: () => "Mãe e pai recebem cada um o próprio link. Funciona para qualquer formação familiar, com um ou mais responsáveis.",
  },
  terapeuta: {
    title: "O terapeuta",
    color: "var(--k-purple)",
    text: () => "Registra o que observa a cada sessão e cruza as visões num painel feito para a prática clínica e escolar.",
  },
};

/** Quem responde o teste, na ordem paciente → família → terapeuta. */
function respondents(test: Test) {
  const fromStages = new Set(test.stages.flatMap((s) => s.rules.map((r) => r.role)));
  const roles = fromStages.size ? fromStages : new Set(test.questions.filter((q) => q.active).flatMap((q) => q.targets));
  return (["paciente", "responsavel", "terapeuta"] as RespondentRole[]).filter((r) => roles.has(r));
}

export default async function TestLandingPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const preview = !!(await searchParams).previa;
  const test = await findTest(slug, preview);
  if (!test?.landing) notFound();
  const lp = test.landing;
  const user = await currentUser();
  const enter = user ? { href: "/painel", label: "Ir para o painel" } : { href: "/entrar", label: "Entrar" };
  const contact = lp.contactUrl || process.env.CONTACT_URL;

  const categories = [...test.categories].sort((a, b) => a.order - b.order);
  const roles = respondents(test);
  const aboutOther = test.stages.some((s) => s.rules.some((r) => r.about === "outro"));
  const hasStart = test.stages.some((s) => s.kind === "inicial");
  const hasSessions = test.stages.some((s) => s.kind === "sessao");
  const flow = [
    hasStart && { title: "Início", text: "Uma avaliação de partida com cada pessoa que responde." },
    hasSessions && { title: "Sessões", text: "Poucas perguntas por encontro, sorteadas para não repetir e equilibrar as classificações." },
    { title: "Evolução", text: "Radar, ecomapa e linha do tempo mostram o que avançou e onde vale insistir." },
  ].filter((x): x is { title: string; text: string } => !!x);

  return (
    <main className="lp">
      {!lp.published || !test.active ? <p className="lp-preview">Prévia: esta página ainda não está publicada.</p> : null}
      <header className="container topbar">
        <Link href={`/teste/${lp.slug}`} className="brand">
          {lp.logoUrl ? <img src={lp.logoUrl} alt={test.name} className="brand-wordmark" /> : <span className="lp-test-name">{test.name}</span>}
        </Link>
        <nav className="row lp-nav">
          {categories.length > 0 && <a href="#classificacoes">O que mede</a>}
          <a href="#como-funciona">Como funciona</a>
          <a href="#rigor">Rigor</a>
          <Link href={enter.href} className="btn sm">
            {enter.label}
          </Link>
        </nav>
      </header>

      <section className={`container lp-hero${lp.heroImageUrl ? "" : " solo"}`}>
        <div>
          {lp.slogan && <p className="hand lp-slogan">{lp.slogan}</p>}
          <h1>{lp.headline || test.name}</h1>
          {(lp.lead || test.description) && <p className="lp-lead">{lp.lead || test.description}</p>}
          <div className="row">
            <a href="#contato" className="btn warm lg">
              Levar para minha escola
            </a>
            <a href="#como-funciona" className="btn ghost lg">
              Como funciona
            </a>
          </div>
          <p className="faint lp-note">Uma ferramenta de triagem e acompanhamento. Não faz diagnóstico.</p>
        </div>
        {lp.heroImageUrl && (
          <div className="lp-mascot" aria-hidden>
            <span className="lp-trail" />
            <img src={lp.heroImageUrl} alt="" />
          </div>
        )}
      </section>

      {categories.length > 0 && (
        <section id="classificacoes" className="container lp-section">
          <p className="lp-kicker">O que a gente olha</p>
          <h2>{lp.skillsTitle || `${categories.length} ${categories.length === 1 ? "classificação" : "classificações"}`}</h2>
          <Dots />
          {lp.skillsLead && <p className="muted lp-sub">{lp.skillsLead}</p>}
          <div className="lp-skills-wrap">
            <figure className="lp-card lp-ecomap-card">
              <DemoEcomap count={categories.length} />
              <figcaption className="faint">Ecomapa: quanto mais perto do centro, mais desenvolvida. Exemplo ilustrativo.</figcaption>
            </figure>
            <ol className="lp-skills">
              {categories.map((c, i) => (
                <li key={c.id} style={{ "--c": LP_COLORS[i % LP_COLORS.length] } as React.CSSProperties}>
                  <span className="lp-skill-n">{i + 1}</span>
                  <span>{c.name}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section id="como-funciona" className="lp-band lp-dark">
        <div className="container lp-section">
          <p className="lp-kicker">{roles.length > 1 ? "Avaliação 360" : "Como funciona"}</p>
          <h2>{roles.length > 2 ? "Três olhares sobre a mesma pessoa" : roles.length === 2 ? "Dois olhares sobre a mesma pessoa" : "Um retrato ao longo do tempo"}</h2>
          <Dots />
          {roles.length > 0 && (
            <div className="lp-steps">
              {roles.map((r) => (
                <article key={r} className="lp-card">
                  <span className="lp-dot" style={{ background: ROLE_CARD[r].color }} />
                  <h3>{ROLE_CARD[r].title}</h3>
                  <p className="muted">{ROLE_CARD[r].text(aboutOther)}</p>
                </article>
              ))}
            </div>
          )}
          <div className="lp-flow">
            {flow.map((f, i) => (
              <div key={f.title}>
                <span className="lp-flow-n">{i + 1}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="rigor" className="container lp-section">
        <p className="lp-kicker">Cuidado com o que se mede</p>
        <h2>Leve para quem responde, sério para quem analisa</h2>
        <Dots />
        <div className="lp-rigor">
          <div className="lp-card">
            <h3>Menos viés nas respostas</h3>
            <p className="muted">
              Quem responde toca em símbolos abstratos e nunca vê a classificação avaliada nem o peso das opções. As perguntas se misturam e mudam
              entre as sessões.
            </p>
          </div>
          <div className="lp-card sand">
            <h3>Medida com base estatística</h3>
            <p className="muted">
              Além do percentual, cada classificação é estimada pela Teoria de Resposta ao Item (modelo Rasch), com margem de erro e sinal de
              perguntas ambíguas para a equipe revisar.
            </p>
          </div>
          <div className="lp-card">
            <h3>Dados no lugar certo</h3>
            <p className="muted">
              Cada pessoa vê só os próprios formulários. O terapeuta vê só os seus pacientes, dentro da sua escola. Análises comparativas ficam
              restritas à equipe.
            </p>
          </div>
        </div>
      </section>

      <section id="contato" className="container lp-section">
        <div className="lp-cta">
          <div className="lp-cta-text">
            <p className="lp-kicker">Para escolas e terapeutas</p>
            <h2>Quer aplicar este teste com a sua equipe?</h2>
            <p>
              Cada escola entra na plataforma com a própria equipe de terapeutas e escolhe os testes que aplica. Os pacientes e as famílias
              respondem pelo celular, sem senha.
            </p>
            <div className="row">
              {contact && (
                <a href={contact} className="btn lg lp-btn-light">
                  Falar com a equipe
                </a>
              )}
              <Link href={enter.href} className="btn ghost lg lp-btn-outline">
                {enter.label}
              </Link>
            </div>
          </div>
          {lp.heroImageUrl && <img src={lp.heroImageUrl} alt="" className="lp-cta-mascot" />}
        </div>
      </section>

      <footer className="lp-band lp-dark lp-footer-band">
        <div className="container lp-footer">
          <span className="lp-test-name light">{test.name}</span>
          <Link href="/" className="lp-footer-platform">
            um teste da plataforma <PlatformWordmark light />
          </Link>
          <span className="faint">Triagem e acompanhamento. Não substitui avaliação profissional.</span>
        </div>
      </footer>
    </main>
  );
}

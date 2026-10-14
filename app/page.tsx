/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { Dots, LP_COLORS, PlatformWordmark } from "@/app/components/LandingParts";
import "./landing.css";

export const dynamic = "force-dynamic";

// link do botão "Falar com a equipe" (mailto:, WhatsApp, formulário…); sem ele o botão some
const CONTACT_URL = process.env.CONTACT_URL;

/** Página inicial da plataforma: escolas que acompanham seus pacientes por meio de testes. Cada teste tem a própria landing. */
export default async function Home() {
  const user = await currentUser();
  const enter = user ? { href: "/painel", label: "Ir para o painel" } : { href: "/entrar", label: "Entrar" };
  const db = await readDb();
  const tests = db.tests
    .filter((t) => t.active && t.landing?.published)
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.landing!.slug,
      logoUrl: t.landing!.logoUrl,
      lead: t.landing!.headline || t.description,
      categories: t.categories.length,
      questions: t.questions.filter((q) => q.active).length,
    }));

  return (
    <main className="lp lp-platform">
      <header className="container topbar">
        <Link href="/" className="brand">
          <PlatformWordmark />
        </Link>
        <nav className="row lp-nav">
          <a href="#como-funciona">Como funciona</a>
          {tests.length > 0 && <a href="#testes">Testes</a>}
          <a href="#escolas">Para escolas</a>
          <Link href={enter.href} className="btn sm">
            {enter.label}
          </Link>
        </nav>
      </header>

      <section className="container lp-hero">
        <div>
          <p className="lp-kicker">Plataforma de acompanhamento</p>
          <h1>Aprender e acompanhar, um teste de cada vez.</h1>
          <p className="lp-lead">
            O Skiller TRI reúne escolas que acompanham seus pacientes por meio de testes. Cada escola tem a própria equipe de terapeutas; cada
            teste mede o que importa ouvindo quem convive com a pessoa, e mostra a evolução sessão a sessão.
          </p>
          <div className="row">
            <a href={tests.length ? "#testes" : "#escolas"} className="btn warm lg">
              {tests.length ? "Conhecer os testes" : "Trazer minha escola"}
            </a>
            <a href="#como-funciona" className="btn ghost lg">
              Como funciona
            </a>
          </div>
        </div>
        <HeroDiagram />
      </section>

      <section id="como-funciona" className="lp-band lp-dark">
        <div className="container lp-section">
          <p className="lp-kicker">Como funciona</p>
          <h2>Da escola ao resultado, cada um no seu lugar</h2>
          <Dots />
          <div className="lp-flow lp-flow-top">
            <div>
              <span className="lp-flow-n">1</span>
              <h3>A plataforma cria os testes</h3>
              <p>Perguntas, classificações, escalas e etapas, calibrados com Teoria de Resposta ao Item à medida que as respostas chegam.</p>
            </div>
            <div>
              <span className="lp-flow-n">2</span>
              <h3>A escola escolhe e aplica</h3>
              <p>Cada escola entra com a sua equipe de terapeutas e escolhe quais testes aplica aos seus pacientes.</p>
            </div>
            <div>
              <span className="lp-flow-n">3</span>
              <h3>Todos respondem, o terapeuta acompanha</h3>
              <p>Paciente e família respondem pelo celular, sem senha. O terapeuta vê os resultados dos seus pacientes e a evolução.</p>
            </div>
          </div>
        </div>
      </section>

      {tests.length > 0 && (
        <section id="testes" className="container lp-section">
          <p className="lp-kicker">Testes da plataforma</p>
          <h2>Escolha o que acompanhar</h2>
          <Dots />
          <p className="muted lp-sub">Cada teste tem a sua página, com o que mede, quem responde e como funciona.</p>
          <div className="lp-tests">
            {tests.map((t, i) => (
              <Link key={t.id} href={`/teste/${t.slug}`} className="lp-card lp-test-card" style={{ "--c": LP_COLORS[i % LP_COLORS.length] } as React.CSSProperties}>
                {t.logoUrl ? <img src={t.logoUrl} alt={t.name} className="lp-test-logo" /> : <span className="lp-test-name">{t.name}</span>}
                {t.lead && <p className="muted">{t.lead}</p>}
                <p className="lp-test-meta">
                  {t.categories} classificações · {t.questions} perguntas
                </p>
                <span className="lp-test-go">Conhecer o teste →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="escolas" className="container lp-section">
        <p className="lp-kicker">Quem vê o quê</p>
        <h2>Cada pessoa vê só o que é seu</h2>
        <Dots />
        <div className="lp-rigor">
          <div className="lp-card">
            <h3>A escola</h3>
            <p className="muted">Monta a equipe de terapeutas e escolhe os testes. Os dados de uma escola nunca aparecem para outra.</p>
          </div>
          <div className="lp-card sand">
            <h3>O terapeuta</h3>
            <p className="muted">
              Não acessa a plataforma: entra e encontra só os testes aplicados na sua escola, respondidos pelos seus pacientes.
            </p>
          </div>
          <div className="lp-card">
            <h3>Paciente e família</h3>
            <p className="muted">Cada um recebe o próprio link e vê só os próprios formulários. Nada de comparação com outras pessoas.</p>
          </div>
        </div>
      </section>

      <section id="contato" className="container lp-section">
        <div className="lp-cta lp-cta-solo">
          <div className="lp-cta-text">
            <p className="lp-kicker">Para escolas e clínicas</p>
            <h2>Quer acompanhar seus pacientes com a gente?</h2>
            <p>Estamos em fase piloto e abrindo espaço para escolas parceiras. A gente cadastra a sua escola, a sua equipe e os testes que fizerem sentido.</p>
            <div className="row">
              {CONTACT_URL && (
                <a href={CONTACT_URL} className="btn lg lp-btn-light">
                  Falar com a equipe
                </a>
              )}
              <Link href={enter.href} className="btn ghost lg lp-btn-outline">
                {enter.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-band lp-dark lp-footer-band">
        <div className="container lp-footer">
          <PlatformWordmark light />
          <span className="faint">Triagem e acompanhamento. Não substitui avaliação profissional.</span>
        </div>
      </footer>
    </main>
  );
}

/** Escola → equipe → pacientes → testes, como uma árvore. Ilustrativo. */
function HeroDiagram() {
  const therapists = [110, 200, 290];
  return (
    <svg viewBox="0 0 400 400" className="lp-hero-diagram" role="img" aria-label="Uma escola, sua equipe de terapeutas e os pacientes de cada um respondendo testes">
      <circle cx="200" cy="215" r="178" fill="var(--k-sand)" opacity="0.55" />
      {therapists.map((x, i) => (
        <g key={x}>
          <path d={`M200 92 C200 130 ${x} 120 ${x} 168`} fill="none" stroke="var(--k-navy)" strokeWidth="2.5" opacity="0.5" />
          {[-30, 0, 30].map((dx, j) => (
            <path key={dx} d={`M${x} 196 C${x} 230 ${x + dx} 228 ${x + dx} 262`} fill="none" stroke={LP_COLORS[i]} strokeWidth="2" opacity="0.6" strokeDasharray={j === 1 ? "0" : "4 5"} />
          ))}
        </g>
      ))}
      <rect x="140" y="44" width="120" height="48" rx="24" fill="var(--k-navy)" />
      <text x="200" y="74" textAnchor="middle" className="lp-diagram-label light">
        escola
      </text>
      {therapists.map((x, i) => (
        <g key={x}>
          <circle cx={x} cy="182" r="22" fill={LP_COLORS[i]} />
          <text x={x} y="187" textAnchor="middle" className="lp-diagram-label light small">
            T{i + 1}
          </text>
          {[-30, 0, 30].map((dx) => (
            <circle key={dx} cx={x + dx} cy="272" r="10" fill="#fffbf4" stroke={LP_COLORS[i]} strokeWidth="3" />
          ))}
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={118 + i * 62} y="318" width="50" height="38" rx="8" fill="#fffbf4" stroke="var(--k-navy)" strokeWidth="2" opacity={1 - i * 0.2} />
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={127 + i * 62} y="330" width="32" height="5" rx="2.5" fill={LP_COLORS[i + 3]} />
          <rect x={127 + i * 62} y="341" width="22" height="5" rx="2.5" fill="var(--line)" />
        </g>
      ))}
      <text x="200" y="384" textAnchor="middle" className="lp-diagram-label">
        testes
      </text>
    </svg>
  );
}

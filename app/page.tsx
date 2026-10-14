import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { BrandMark } from "@/app/components/BrandMark";
import "./landing.css";

export const dynamic = "force-dynamic";

// link do botão "Falar com a equipe" (mailto:, WhatsApp, formulário…); sem ele o botão some
const CONTACT_URL = process.env.CONTACT_URL;

// paleta KAY12 (definida em landing.css, só na landing)
const COLORS = ["var(--k-orange)", "var(--k-teal)", "var(--k-purple)", "var(--k-yellow)", "var(--k-green)", "var(--k-navy)"];

const SKILLS = [
  "Pertencimento e vínculos",
  "Autoconhecimento",
  "Reconhecimento e expressão emocional",
  "Autorregulação",
  "Autonomia e autocuidado",
  "Comunicação",
  "Empatia e respeito às diferenças",
  "Cooperação",
  "Resolução de conflitos e responsabilidade",
  "Criatividade e resolução de problemas",
  "Tomada de decisão e liderança compartilhada",
  "Responsabilidade e participação social",
];

// distâncias só ilustrativas: quanto mais perto do centro, mais desenvolvida a habilidade
const DEMO = [0.42, 0.62, 0.8, 0.95, 0.5, 0.36, 0.58, 0.46, 0.88, 0.4, 0.72, 0.55];

function Ecomap() {
  const c = 200;
  return (
    <svg viewBox="0 0 400 400" className="lp-ecomap" role="img" aria-label="Exemplo ilustrativo de ecomapa com 12 habilidades ao redor do adolescente">
      {[60, 110, 160].map((r) => (
        <circle key={r} cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeDasharray="3 6" />
      ))}
      {DEMO.map((d, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const r = 40 + d * 130;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const color = COLORS[i % COLORS.length];
        return (
          <g key={i}>
            <line x1={c} y1={c} x2={x} y2={y} stroke={color} strokeWidth={2.2 - d * 1.4} opacity={0.55} />
            <circle cx={x} cy={y} r={15} fill={color} opacity={0.92} />
            <text x={x} y={y + 4.5} textAnchor="middle" className="lp-ecomap-n">{i + 1}</text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r={30} fill="var(--k-navy)" />
      <text x={c} y={c + 5} textAnchor="middle" className="lp-ecomap-me">eu</text>
    </svg>
  );
}

/** assinatura da marca: os 4 pontos da camiseta do mascote */
function Dots() {
  return (
    <span className="lp-dots" aria-hidden>
      <i /><i /><i /><i />
    </span>
  );
}

export default async function Home() {
  const user = await currentUser();
  const enter = user ? { href: "/painel", label: "Ir para o painel" } : { href: "/entrar", label: "Entrar" };

  return (
    <main className="lp">
      <header className="container topbar">
        <Link href="/" className="brand">
          <BrandMark />
        </Link>
        <nav className="row lp-nav">
          <a href="#habilidades">Habilidades</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#rigor">Rigor</a>
          <Link href={enter.href} className="btn sm">{enter.label}</Link>
        </nav>
      </header>

      <section className="container lp-hero">
        <div>
          <p className="hand lp-slogan">habilidades fora da caixa</p>
          <h1>Ver cada adolescente por inteiro, e por todos os ângulos.</h1>
          <p className="lp-lead">
            O KAY12 acompanha as 12 habilidades socioemocionais de adolescentes ouvindo quem convive com eles:
            o próprio jovem, a família e o terapeuta. Um retrato 360 que vira conversa, plano e evolução.
          </p>
          <div className="row">
            <a href="#contato" className="btn warm lg">Levar para minha escola</a>
            <a href="#como-funciona" className="btn ghost lg">Como funciona</a>
          </div>
          <p className="faint lp-note">Uma ferramenta de triagem e acompanhamento. Não faz diagnóstico.</p>
        </div>
        <div className="lp-mascot" aria-hidden>
          <span className="lp-trail" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mascote.webp" alt="" />
        </div>
      </section>

      <section id="habilidades" className="container lp-section">
        <p className="lp-kicker">O que a gente olha</p>
        <h2>12 habilidades para a vida</h2>
        <Dots />
        <p className="muted lp-sub">Da relação consigo à relação com o mundo, cada uma medida com perguntas próprias.</p>
        <div className="lp-skills-wrap">
          <figure className="lp-card lp-ecomap-card">
            <Ecomap />
            <figcaption className="faint">Ecomapa: quanto mais perto do centro, mais desenvolvida a habilidade. Exemplo ilustrativo.</figcaption>
          </figure>
          <ol className="lp-skills">
            {SKILLS.map((s, i) => (
              <li key={s} style={{ "--c": COLORS[i % COLORS.length] } as React.CSSProperties}>
                <span className="lp-skill-n">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="como-funciona" className="lp-band lp-dark">
        <div className="container lp-section">
          <p className="lp-kicker">Avaliação 360</p>
          <h2>Três olhares sobre a mesma pessoa</h2>
          <Dots />
          <div className="lp-steps">
            <article className="lp-card">
              <span className="lp-dot" style={{ background: "var(--k-teal)" }} />
              <h3>O adolescente</h3>
              <p className="muted">Responde sobre si e sobre o outro, num questionário curto, visual e sem senha, direto do celular.</p>
            </article>
            <article className="lp-card">
              <span className="lp-dot" style={{ background: "var(--k-yellow)" }} />
              <h3>A família</h3>
              <p className="muted">Mãe e pai recebem cada um o próprio link. Funciona para qualquer formação familiar, com um ou mais responsáveis.</p>
            </article>
            <article className="lp-card">
              <span className="lp-dot" style={{ background: "var(--k-purple)" }} />
              <h3>O terapeuta</h3>
              <p className="muted">Registra o que observa a cada sessão e cruza as visões num painel feito para a prática clínica e escolar.</p>
            </article>
          </div>

          <div className="lp-flow">
            <div>
              <span className="lp-flow-n">1</span>
              <h3>Início</h3>
              <p>Uma avaliação de partida com o jovem e cada responsável.</p>
            </div>
            <div>
              <span className="lp-flow-n">2</span>
              <h3>Sessões</h3>
              <p>Poucas perguntas por encontro, sorteadas para não repetir e equilibrar as habilidades.</p>
            </div>
            <div>
              <span className="lp-flow-n">3</span>
              <h3>Evolução</h3>
              <p>Radar, ecomapa e linha do tempo mostram o que avançou e onde vale insistir.</p>
            </div>
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
              Cada pergunta ganha um símbolo abstrato próprio. Quem responde nunca vê a habilidade avaliada nem o peso
              das opções, e as perguntas se misturam e mudam entre as sessões.
            </p>
          </div>
          <div className="lp-card sand">
            <h3>Medida com base estatística</h3>
            <p className="muted">
              Além do percentual, cada habilidade é estimada pela Teoria de Resposta ao Item (modelo Rasch), com margem
              de erro e sinal de perguntas ambíguas para a equipe revisar.
            </p>
          </div>
          <div className="lp-card">
            <h3>Dados no lugar certo</h3>
            <p className="muted">
              Cada pessoa vê só os próprios formulários. Grupos de perfis e análises comparativas ficam restritos à equipe
              terapêutica.
            </p>
          </div>
        </div>
      </section>

      <section id="contato" className="container lp-section">
        <div className="lp-cta">
          <div className="lp-cta-text">
            <p className="lp-kicker">Para escolas e terapeutas</p>
            <h2>Quer usar o KAY12 com seus adolescentes?</h2>
            <p>
              Criado com a equipe Fora da Caixa e em fase piloto. Estamos abrindo espaço para escolas e clínicas parceiras
              acompanharem seus grupos com a gente.
            </p>
            <div className="row">
              {CONTACT_URL && (
                <a href={CONTACT_URL} className="btn lg lp-btn-light">Falar com a equipe</a>
              )}
              <Link href={enter.href} className="btn ghost lg lp-btn-outline">{enter.label}</Link>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mascote.webp" alt="" className="lp-cta-mascot" />
        </div>
      </section>

      <footer className="lp-band lp-dark lp-footer-band">
        <div className="container lp-footer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark-creme.svg" alt="KAY12" className="lp-footer-logo" />
          <span className="hand">habilidades fora da caixa</span>
          <span className="faint">Triagem e acompanhamento. Não substitui avaliação profissional.</span>
        </div>
      </footer>
    </main>
  );
}

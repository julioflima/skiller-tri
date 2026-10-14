import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { BrandMark } from "@/app/components/BrandMark";
import "./landing.css";

export const dynamic = "force-dynamic";

// link do botão "Falar com a equipe" (mailto:, WhatsApp, formulário…); sem ele o botão some
const CONTACT_URL = process.env.CONTACT_URL;

const COLORS = ["var(--sky)", "var(--terracotta)", "var(--sage)", "var(--lilac)", "var(--ochre)", "var(--rose)"];

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
            <circle cx={x} cy={y} r={15} fill={color} opacity={0.85} filter="url(#wc-symbol)" />
            <text x={x} y={y + 4.5} textAnchor="middle" className="lp-ecomap-n">{i + 1}</text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r={30} fill="var(--indigo)" filter="url(#wc-symbol)" />
      <text x={c} y={c + 5} textAnchor="middle" className="lp-ecomap-me">eu</text>
    </svg>
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
          <p className="hand lp-kicker">habilidades fora da caixa</p>
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
        <figure className="card lp-hero-card">
          <Ecomap />
          <figcaption className="faint">Ecomapa: quanto mais perto do centro, mais desenvolvida a habilidade. Exemplo ilustrativo.</figcaption>
        </figure>
      </section>

      <section id="habilidades" className="container lp-section">
        <p className="hand">o que a gente olha</p>
        <h2>12 habilidades para a vida</h2>
        <p className="muted lp-sub">Da relação consigo à relação com o mundo, cada uma medida com perguntas próprias.</p>
        <ol className="lp-skills">
          {SKILLS.map((s, i) => (
            <li key={s} className={`card tight${i % 2 ? " alt" : ""}`} style={{ "--c": COLORS[i % COLORS.length] } as React.CSSProperties}>
              <span className="lp-skill-n">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="como-funciona" className="container lp-section">
        <p className="hand">avaliação 360</p>
        <h2>Três olhares sobre a mesma pessoa</h2>
        <div className="lp-steps">
          <article className="card">
            <span className="lp-dot" style={{ background: "var(--sky)" }} />
            <h3>O adolescente</h3>
            <p className="muted">Responde sobre si e sobre o outro, num questionário curto, visual e sem senha, direto do celular.</p>
          </article>
          <article className="card alt">
            <span className="lp-dot" style={{ background: "var(--rose)" }} />
            <h3>A família</h3>
            <p className="muted">Mãe e pai recebem cada um o próprio link. Funciona para qualquer formação familiar, com um ou mais responsáveis.</p>
          </article>
          <article className="card">
            <span className="lp-dot" style={{ background: "var(--sage)" }} />
            <h3>O terapeuta</h3>
            <p className="muted">Registra o que observa a cada sessão e cruza as visões num painel feito para a prática clínica e escolar.</p>
          </article>
        </div>

        <div className="lp-flow">
          <div>
            <span className="lp-flow-n">1</span>
            <h3>Início</h3>
            <p className="muted">Uma avaliação de partida com o jovem e cada responsável.</p>
          </div>
          <div>
            <span className="lp-flow-n">2</span>
            <h3>Sessões</h3>
            <p className="muted">Poucas perguntas por encontro, sorteadas para não repetir e equilibrar as habilidades.</p>
          </div>
          <div>
            <span className="lp-flow-n">3</span>
            <h3>Evolução</h3>
            <p className="muted">Radar, ecomapa e linha do tempo mostram o que avançou e onde vale insistir.</p>
          </div>
        </div>
      </section>

      <section id="rigor" className="container lp-section">
        <p className="hand">cuidado com o que se mede</p>
        <h2>Leve para quem responde, sério para quem analisa</h2>
        <div className="lp-rigor">
          <div className="card">
            <h3>Menos viés nas respostas</h3>
            <p className="muted">
              Cada pergunta ganha um símbolo abstrato próprio. Quem responde nunca vê a habilidade avaliada nem o peso
              das opções, e as perguntas se misturam e mudam entre as sessões.
            </p>
          </div>
          <div className="card alt">
            <h3>Medida com base estatística</h3>
            <p className="muted">
              Além do percentual, cada habilidade é estimada pela Teoria de Resposta ao Item (modelo Rasch), com margem
              de erro e sinal de perguntas ambíguas para a equipe revisar.
            </p>
          </div>
          <div className="card">
            <h3>Dados no lugar certo</h3>
            <p className="muted">
              Cada pessoa vê só os próprios formulários. Grupos de perfis e análises comparativas ficam restritos à equipe
              terapêutica.
            </p>
          </div>
        </div>
      </section>

      <section id="contato" className="container lp-section">
        <div className="card lp-cta">
          <div>
            <p className="hand">para escolas e terapeutas</p>
            <h2>Quer usar o KAY12 com seus adolescentes?</h2>
            <p className="muted">
              Criado com a equipe Fora da Caixa e em fase piloto. Estamos abrindo espaço para escolas e clínicas parceiras
              acompanharem seus grupos com a gente.
            </p>
          </div>
          <div className="row">
            {CONTACT_URL && (
              <a href={CONTACT_URL} className="btn warm lg">Falar com a equipe</a>
            )}
            <Link href={enter.href} className="btn ghost lg">{enter.label}</Link>
          </div>
        </div>
      </section>

      <footer className="container lp-footer faint">
        <span>KAY12 · habilidades fora da caixa</span>
        <span>Triagem e acompanhamento. Não substitui avaliação profissional.</span>
      </footer>
    </main>
  );
}

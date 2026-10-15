import type { Metadata } from "next";
import { Caveat, Fraunces, Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["400", "600", "700"] });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Skiller · Acompanhamento por meio de testes",
  description: "Plataforma de escolas que acompanham seus pacientes por meio de testes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${nunito.variable} ${caveat.variable} ${fredoka.variable}`}>
      <body>
        {/* filtros SVG que dão a borda irregular de aquarela */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="wc-edge">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="18" />
          </filter>
          <filter id="wc-symbol" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="0.4" />
          </filter>
        </svg>
        <div className="washes" aria-hidden>
          <div className="wash a" />
          <div className="wash b" />
          <div className="wash c" />
          <div className="wash d" />
        </div>
        {children}
      </body>
    </html>
  );
}

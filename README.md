# Skiller · Habilidades fora da caixa

Acompanhamento terapêutico com testes configuráveis e tema de aquarela. O teste inicial vem da planilha
*12 habilidades fora da caixa* (98 perguntas, 12 classificações, escala 0–4).

## Quem usa

| Rota | Quem | O que faz |
|------|------|-----------|
| `/` | equipe | Login com e-mail e senha. |
| `/painel` | terapeuta e admin | Pacientes e famílias, links individuais, sessões, resultados e exportação CSV. O terapeuta vê só os próprios pacientes. |
| `/painel/testes` | admin | Testes: perguntas, classificações, respostas com pesos e etapas. |
| `/painel/equipe` | admin | Cadastro de terapeutas e administradores (direto ou por convite). |
| `/painel/configuracoes` | admin | Chave da API de IA, modelo e instruções para os símbolos. |
| `/r/<link>` | paciente, cada mãe/pai, terapeuta | Página pessoal de respostas, sem senha. Cada pessoa vê só os próprios formulários. |

## Pacientes e famílias

Cada paciente tem um terapeuta, um teste e de zero a vários responsáveis, cada um marcado como **mãe** ou **pai**.
Isso cobre famílias MF, MM e FF (M = pai, F = mãe), e também famílias com um só responsável. Paciente, cada responsável
e o terapeuta recebem **links próprios**. Gerar um novo link desativa o anterior.

## Testes

Um teste define:

- **Perguntas**: texto, **classificação**, **escala de respostas**, **para quem** a pergunta pode ser feita
  (paciente, mãe/pai, terapeuta), se o paciente pode respondê-la **sobre si** e/ou **sobre o outro**, e o **peso** da pergunta.
- **Respostas e pesos**: escalas com as opções de resposta e o peso (valor) de cada uma.
- **Etapas**: *Início do tratamento* (uma vez) e *Sessão* (a cada sessão registrada). Cada etapa tem regras do tipo
  "quem responde, quantas perguntas, sobre quem, de quais classificações", com uma instrução mostrada antes do bloco.

O teste padrão segue o combinado:

| Etapa | Paciente | Cada mãe/pai | Terapeuta |
|-------|----------|--------------|-----------|
| Início do tratamento | 30 sobre si | 60 sobre o paciente | — |
| Cada sessão | 5 sobre si + 5 sobre o outro | — | 10 sobre o paciente |

Todos esses números podem ser alterados em *Testes → Etapas*. As perguntas são sorteadas entre as que servem para aquela pessoa.
O sorteio prioriza as que ela respondeu menos vezes e equilibra as classificações. Um formulário ainda não iniciado pode ser sorteado de novo.

## Resultados

Cada resposta vira um percentual entre o menor e o maior peso da escala e é ponderada pelo peso da pergunta.
O resultado sai por classificação, separado em: paciente sobre si, paciente sobre o outro, cada responsável e terapeuta.
Há radar, tabela, evolução por sessão e CSV com uma linha por resposta. As faixas (`lib/scoring.ts`) são descritivas e
não substituem a análise do profissional.

## Como os vieses são reduzidos

- Cada pergunta aparece com um **símbolo abstrato** próprio. A classificação e os pesos nunca vão ao navegador de quem responde.
- O sorteio mistura as classificações e varia as perguntas entre as sessões.
- As instruções para a IA proíbem símbolos figurativos, com carga emocional ou que ilustrem a afirmação.

## Rodando

```bash
npm install
cp .env.example .env.local   # defina SESSION_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD
npm run dev
```

Sem `ADMIN_EMAIL`/`ADMIN_PASSWORD`, o primeiro acesso é `admin@skiller.local` com senha `admin`. **Troque antes de publicar.**

### Símbolos com IA

Cadastre a chave da Anthropic em *Configurações* (ou use `ANTHROPIC_API_KEY`). Depois, em *Testes → Perguntas*, use
**Gerar símbolos faltantes** ou o botão ✦ de cada pergunta. O SVG devolvido é validado (sem scripts, links ou texto)
e exibido sempre como `<img>`.

## Deploy na Vercel

O app roda inteiro na Vercel: páginas e APIs (Server Actions e route handlers) no próprio Next.js,
dados no **Prisma Postgres** e SVGs dos símbolos no **Vercel Blob**, os dois ligados em *Storage*.

| Variável                | Origem |
|-------------------------|--------|
| `DATABASE_URL`          | Criada pela integração Prisma Postgres |
| `BLOB_STORE_ID`         | Criada pelo Vercel Blob (autentica por OIDC, sem token fixo) |
| `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Definir à mão em *Settings → Environment Variables* |
| `ANTHROPIC_API_KEY`     | Opcional |

No deploy, o script `vercel-build` roda `prisma generate`, depois `prisma migrate deploy` e por fim `next build`.
Assim a tabela é criada ou atualizada antes de o app subir.

Localmente:

```bash
vercel link && vercel env pull .env.local   # traz DATABASE_URL, BLOB_STORE_ID e VERCEL_OIDC_TOKEN
npm install                                 # roda prisma generate
npm run db:migrate                          # cria a tabela no Postgres
npm run db:import                           # opcional: copia data/db.json para o Postgres
```

O schema (`prisma/schema.prisma`) guarda cada entidade do `Db` como uma linha JSON da tabela `Record`,
indexada por coleção e id. O `lib/db-prisma.ts` faz a leitura e a gravação incremental, e um *advisory lock*
do Postgres serializa as alterações entre as instâncias da Vercel. O helper do Blob fica em
`lib/symbol-storage.ts`.

# Skiller TRI · Acompanhamento por meio de testes

Plataforma de escolas que acompanham seus pacientes por meio de testes configuráveis. Cada **escola** é uma equipe de
terapeutas que aplica alguns testes da plataforma; cada **teste** tem a própria landing page. O teste inicial vem da planilha
*12 habilidades fora da caixa* (KAY12: 98 perguntas, 12 classificações, escala 0–4).

## Quem usa

| Rota | Quem | O que faz |
|------|------|-----------|
| `/` | público | Landing da plataforma, com os testes publicados. |
| `/teste/<endereço>` | público | Landing de um teste (ex.: `/teste/kay12`). Rascunho: `?previa=1`, só para admin. |
| `/entrar` | equipe | Login com e-mail e senha. |
| `/painel` | terapeuta e admin | Pacientes e famílias, links individuais, sessões, resultados e exportação CSV. O terapeuta vê só os próprios pacientes, na sua escola. |
| `/painel/analise` | terapeuta e admin | Correlação entre habilidades, grupos de perfis, calibração TRI e tempo de resposta por pergunta. O terapeuta vê só os testes da escola e os próprios pacientes. |
| `/painel/testes` | admin | Testes: perguntas, classificações, respostas com pesos, etapas e landing page. |
| `/painel/escolas` | admin | Escolas: nome, situação e quais testes cada uma aplica. |
| `/painel/equipe` | admin | Cadastro de terapeutas (sempre de uma escola) e administradores (direto ou por convite). |
| `/painel/configuracoes` | admin | Chave da API de IA, modelo e instruções para os símbolos. |
| `/r/<link>` | paciente, cada mãe/pai, terapeuta | Página pessoal de respostas, sem senha. Cada pessoa vê só os próprios formulários. |

## Escolas e papéis

- **Administrador**: equipe da plataforma. Não pertence a escola, vê tudo, cria testes, escolas e contas.
- **Terapeuta**: membro de uma escola. Não acessa a plataforma: vê só os pacientes que acompanha, na sua escola, nos testes que
  ela aplica (`canSeePatient` e `testsFor` em `lib/auth.ts`).
- **Escola**: equipe de terapeutas + lista de testes aplicados. Todo paciente pertence a uma escola, e o terapeuta e o teste dele
  precisam ser dessa escola. Um teste em uso por pacientes da escola não pode ser retirado dela; um terapeuta com pacientes não
  troca de escola sem antes passá-los a outro terapeuta.

Os dados anteriores às escolas são migrados na leitura (`migrate` em `lib/db.ts`, só acrescenta campos): terapeutas e pacientes vão
para a escola **Fora da Caixa** (id fixo `escola-padrao`, com todos os testes) e o teste das 12 habilidades recebe a landing
`/teste/kay12`, com o conteúdo que antes era a página inicial.

## Landing dos testes

Em *Testes → Landing page*: endereço, publicação, título, textos, logo, imagem de destaque e contato. As classificações, quem
responde e as etapas saem do próprio teste. Testes ativos e publicados aparecem na página inicial da plataforma.

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
Há radar, **ecomapa** (a pessoa no centro e as habilidades como satélites: quanto mais perto, mais desenvolvida; visão 360
ou por pessoa que respondeu), tabela, evolução por sessão e CSV com uma linha por resposta. As faixas (`lib/scoring.ts`) são
descritivas e não substituem a análise do profissional.

### TRI (`lib/irt.ts`)

Ao lado do percentual, cada habilidade ganha uma estimativa pelo **modelo de escala gradual de Andrich** (família Rasch),
unidimensional por habilidade. As dificuldades das perguntas e os limiares da escala são calibrados por máxima verossimilhança
conjunta com todas as respostas do teste ("pessoa" = paciente × quem respondeu). O θ de cada visão sai por EAP (priori normal)
com erro-padrão e percentil aproximado. A calibração exige ao menos 10 pessoas por habilidade e é marcada como instável abaixo
de ~70. Em *Análise* aparecem, por pergunta, a dificuldade e o ajuste (infit/outfit; fora de 0,7–1,3 indica pergunta ambígua ou
redundante), além da confiabilidade de cada habilidade. Numa simulação com 80 pacientes, a calibração recuperou as dificuldades
reais com r = 0,91 e os θ com r = 0,86.

### Análise (`/painel/analise`)

- **Correlação** de Spearman (padrão) ou Pearson entre as habilidades, uma observação por paciente, na visão escolhida
  (paciente sobre si, mãe/pai, terapeuta ou todas as visões sobre o paciente).
- **Grupos de perfis**: k-means (2 a 5 grupos) sobre os percentuais, com mapa em PCA e silhueta. Só a equipe vê; pacientes e
  famílias nunca veem grupos.
- **Tempo de resposta**: o questionário mede o tempo com a aba visível até a escolha (somando as revisões) e quantas vezes a
  resposta foi trocada. A análise mostra a mediana por pergunta e a parcela de respostas rápidas demais (menos de 1,5 s).
  O tempo também aparece em cada formulário e no CSV.

### Cobertura mínima

O editor de testes avisa quando alguma habilidade tem menos de **3 perguntas ativas** para um público usado nas etapas
(paciente sobre si, sobre o outro, mãe/pai, terapeuta): abaixo disso a medida não tem validade estatística.

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

Sem `ADMIN_EMAIL`/`ADMIN_PASSWORD`. **Troque antes de publicar.**

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

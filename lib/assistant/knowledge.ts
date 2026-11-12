// Base de conhecimento do assistente da plataforma (lib/assistant/context.ts): tudo o que ele precisa saber sobre o
// Skiller — ideia, papéis, telas e UX, regras, testes, cálculos, métodos e arquitetura. Vai inteira no prompt de sistema
// (com cache). REGRA: ao mudar uma tela, uma regra ou um cálculo, atualize o trecho correspondente aqui no mesmo commit.

/** Seções de interesse de todos os papéis. */
const PRODUTO = `
# O Skiller

## A ideia
- Skiller é uma plataforma de **aprendizado e acompanhamento por meio de testes**. A plataforma cria e revisa os testes; cada **escola**
  (ou clínica) é uma equipe de terapeutas que escolhe quais testes aplica aos próprios pacientes; paciente e família respondem pelo
  celular, sem senha; o terapeuta acompanha os resultados e a evolução sessão a sessão.
- É **triagem e acompanhamento, não diagnóstico**. Não substitui avaliação profissional. As faixas dos resultados são descritivas.
- Avaliação **360**: o mesmo paciente é visto por vários olhares — ele mesmo (sobre si e sobre o outro), cada responsável (mãe/pai)
  e o terapeuta. Funciona para qualquer formação familiar (mãe e pai, duas mães, dois pais, um só responsável).
- Origem: o primeiro teste, **KAY12 · 12 habilidades fora da caixa**, foi criado com a escola **Fora da Caixa** para triagem das
  12 habilidades socioemocionais de adolescentes. A plataforma está em fase **piloto**, abrindo espaço para escolas parceiras.
- Princípios de produto: cada pessoa vê só o que é seu (dados de uma escola nunca aparecem para outra; paciente e família nunca
  se comparam com outras pessoas nem veem grupos); leve para quem responde, sério para quem analisa; poucas perguntas por encontro;
  reduzir vieses (símbolos nas respostas, sorteio que mistura classificações e varia perguntas, classificação e pesos nunca vão ao
  navegador de quem responde); perguntas sob revisão contínua com dados de qualidade (tempo de resposta).

## Papéis e o que cada um vê
- **Dono** (papel interno admin): é da plataforma, não pertence a escola. Cria testes e escolas, convida outros donos, vê os
  pacientes **dentro de cada escola** (não há lista global), a análise de cada escola e a qualidade dos testes.
- **Administrador da escola** (papel interno gestor): cadastra e edita pacientes, escolhe o terapeuta de cada um, gera os links e
  cuida da equipe (terapeutas e administradores) da própria escola. Não é terapeuta de paciente. Vê todos os pacientes da escola.
- **Terapeuta**: responde os testes sobre os próprios pacientes e analisa os próprios pacientes (resultados, sessões, anotações,
  o próprio link). Não cadastra pacientes nem mexe na equipe. Vê só os próprios pacientes da própria escola.
- **Paciente e cada responsável**: não têm conta. Cada um recebe um **link pessoal** (/r/<código>) e vê só os próprios formulários.
- Uma pessoa entra na plataforma por **convite** (link válido por 7 dias; com e-mail, só aquele e-mail pode usar) ou cadastro direto
  pelo administrador da escola (com senha inicial). O dono é sempre dono; pessoas da escola alternam entre terapeuta e administrador.
  Só terapeuta acompanha paciente: para mudar o papel ou a escola de um terapeuta com pacientes, passe os pacientes a outro antes.
- Uma escola **inativa** deixa de mostrar os testes aos terapeutas e não aceita novos pacientes.

## Telas do painel (UX)
Topo: marca Skiller, nome · papel · escola, botão Sair. Abas conforme o papel. O botão **Assistente** (canto inferior direito)
fica em todas as telas do painel.

- **Pacientes** (/painel; administrador da escola e terapeuta): lista com busca por paciente ou responsável, filtro por terapeuta,
  colunas Paciente, Responsáveis, Terapeuta, Teste, Sessões e **Pendências** (formulários aguardando resposta, ou "em dia").
  Botão para novo paciente (administrador). Arquivados ficam fora da lista principal.
- **Novo paciente / Cadastro** (aba Cadastro do paciente, só administrador e dono): escola (só o dono escolhe), nome completo,
  data de nascimento e e-mail (opcionais), teste (não pode ser trocado depois das primeiras respostas), terapeuta responsável
  (sempre um terapeuta ativo da escola) e responsáveis (mãe ou pai, nome, e-mail e telefone opcionais). Ao cadastrar, são criados
  os formulários do **Início do tratamento**; um responsável acrescentado depois ganha o formulário inicial que falta.
- **Paciente** (/painel/pacientes/<id>), abas:
  - *Acompanhamento*: **Links de resposta** (paciente, cada responsável, terapeuta; copiar ou gerar novo — o novo desativa o anterior;
    o terapeuta só renova o próprio), **Início do tratamento** e **Sessões** com cada formulário (quem responde, progresso,
    concluído/aguardando, ver respostas, sortear outras perguntas se ainda não começou), registrar sessão (data e anotação rápida),
    anotações de cada sessão e **Anotações gerais**. Arquivar paciente esconde da lista sem apagar o histórico.
  - *Resultados*: filtro por momento (todas as respostas, início do tratamento ou uma sessão); **Perfil por classificação** (radar);
    **Ecomapa de habilidades** (a pessoa no centro e as classificações como satélites: quanto mais perto, mais desenvolvida; visão
    360 = média das visões, ou por pessoa); **Tabela por classificação** (percentual e faixa por quem respondeu); **Evolução nas
    sessões** (percentual geral de cada pessoa em cada sessão); exportar **CSV** (uma linha por resposta, com tempo de resposta).
    A página é imprimível.
  - Cada formulário aberto mostra pergunta a pergunta, a resposta, o tempo e as trocas.
- **Análise** (/painel/analise; na escola, para o dono): visões "paciente sobre si", "mãe/pai", "terapeuta" ou "todas as visões
  sobre o paciente"; números de pacientes com dados e tempo mediano; **Correlação entre habilidades** (Spearman padrão ou Pearson) e
  relações mais fortes; **Grupos de perfis** (k-means, 2 a 5 grupos, mapa PCA, silhueta). O terapeuta vê só os próprios pacientes.
- **Equipe** (administrador da escola; para o dono, aba Equipe de cada escola): cadastrar na escola (nome, e-mail, papel, senha inicial
  de 8+ caracteres), editar, ativar/desativar, redefinir senha; **Convidar por link** (nome e e-mail opcionais) com convites
  pendentes, validade e "gerar novo link".
- **Escolas** (dono): lista com testes aplicados, terapeutas, pacientes e situação; criar escola. Dentro de cada escola: abas
  Pacientes, Análise, Equipe e **Dados e testes** (nome, ativa/inativa, testes aplicados; um teste em uso por pacientes da escola
  não pode ser retirado).
- **Testes** (dono): lista com perguntas, classificações, etapas, pacientes, situação; criar teste (em branco, modelo 12 habilidades
  ou duplicar um existente); testes excluídos ficam no arquivo e podem ser restaurados. Dentro de um teste, abas:
  - *✦ Assistente IA*: chat que edita só aquele teste (cita itens com @ pergunta, # classificação, $ escala, ! etapa).
  - *Perguntas*: busca, filtro por classificação e público, nova pergunta (texto, classificação principal, escala, para quem,
    se o paciente responde sobre si e/ou sobre o outro, peso da resposta em cada habilidade), ativar/desativar, reordenar. Uma
    pergunta já usada só pode ser desativada. Há a **matriz de pesos** (perguntas × habilidades) editável como planilha.
    O aviso de **Cobertura mínima** aparece quando alguma classificação tem menos de 3 perguntas ativas para um público usado.
  - *Classificações*: nome e descrição (a descrição aparece no relatório); ordem. Nunca aparecem para quem responde.
  - *Respostas e pesos*: escalas com as respostas, peso de cada uma, descrição e **símbolo** (imagem enviada; sem imagem, um círculo
    padrão que vai enchendo).
  - *Etapas*: "Uma vez, no início do tratamento" ou "A cada sessão"; regras de quem responde (paciente, cada responsável,
    terapeuta), quantas perguntas, sobre quem (paciente: sobre si ou sobre o outro; responsáveis e terapeuta: sobre o paciente),
    de quais classificações e a instrução mostrada antes (aceita {paciente}).
  - *Qualidade*: formulários com respostas e **tempo de resposta por pergunta** (mediana e parcela de rápidas demais).
  - *Dados do teste*: nome, descrição, ativo; arquivar/excluir com confirmação por senha.
  - *Landing page*: endereço (/teste/<endereço>), publicar, slogan, título, texto, título e texto das classificações, logo, imagem de
    destaque, link do WhatsApp do botão "Falar com a equipe". "Ver landing page" abre a página ou a prévia do rascunho.
- **Métodos** (todos): explica os métodos, onde aparecem e quantos dados pedem; não mostra dados.
- **Configurações** (todos): nome, trocar senha, **meu link de respostas** (terapeuta: reúne os formulários de terapeuta de todos os
  seus pacientes); para o dono, a aba **Donos** (convite de donos).

## Fora do painel
- **/** página inicial da plataforma: como funciona, testes publicados, quem vê o quê, contato para escolas.
- **/teste/<endereço>** landing de cada teste (ex.: /teste/kay12), com identidade visual própria do teste.
- **/entrar** login com e-mail e senha (sessão de 12 horas). **/convite/<código>** criar a conta a partir do convite.
- **/r/<código>** página pessoal de respostas: "Para responder" e "Já enviados". No questionário, a pessoa toca no **símbolo** da
  resposta; pode voltar e revisar; ao final "Enviar respostas" (depois do envio não dá para alterar). Cada resposta é salva na hora.

## Como os testes funcionam
- Um teste tem **classificações** (habilidades, domínios ou fatores que agrupam perguntas no resultado), **escalas de resposta**
  (opções com peso numérico, ex.: 0 a 4), **perguntas** e **etapas**.
- Pergunta: texto, classificação principal, escala, para quem pode ser feita (paciente, responsável, terapeuta), perspectivas do
  paciente (sobre si e/ou sobre o outro), peso na classificação principal e, opcionalmente, **pesos em outras habilidades** (uma
  pergunta raramente mede uma habilidade só). O sorteio usa só a classificação principal.
- **Etapas**: "Início do tratamento" acontece uma vez (formulários criados no cadastro); "Sessão" a cada sessão registrada. Cada
  etapa cria **um formulário por pessoa**, juntando os blocos das regras do papel dela.
- **Sorteio**: entre as perguntas ativas que servem para aquela pessoa e perspectiva, prioriza as que ela respondeu menos vezes
  (rodízio), equilibra as classificações e não repete dentro do formulário. Formulário sem respostas pode ser sorteado de novo.
- Cada resposta guarda uma cópia do peso, do mínimo e do máximo da escala no momento, para o histórico não mudar se a escala for
  editada; guarda também o tempo ativo até a escolha e quantas vezes foi trocada.

### KAY12 · 12 habilidades fora da caixa
Triagem das 12 habilidades socioemocionais de adolescentes (landing /teste/kay12). Veio da planilha da escola: 98 perguntas,
12 classificações, escala 0–4. Habilidades: Pertencimento e vínculos; Autoconhecimento; Reconhecimento e expressão emocional;
Autorregulação; Autonomia e autocuidado; Comunicação; Empatia e respeito às diferenças; Cooperação; Resolução de conflitos e
responsabilidade; Criatividade e resolução de problemas; Tomada de decisão e liderança compartilhada; Responsabilidade e
participação social. Escala: 0 Não demonstrou (não apresentou o comportamento ou apresentou o oposto); 1 Demonstrou com muita
dificuldade (precisou de intervenção significativa); 2 Demonstrou parcialmente (de maneira inconsistente); 3 Demonstrou
adequadamente (de maneira espontânea e funcional); 4 Demonstrou de forma elaborada (além de realizar, ajudou o grupo a desenvolver
a habilidade). Etapas combinadas com a escola: Início do tratamento — paciente 30 perguntas sobre si, cada mãe/pai 60 sobre o
paciente; cada Sessão — paciente 5 sobre si + 5 sobre o outro, terapeuta 10 sobre o paciente. O conteúdo atual (perguntas,
descrições) pode ter mudado: consulte com ver_teste.

## Resultados e métodos
- **Percentual e faixas** (resultado principal; precisa de um formulário): cada resposta vira um valor de 0 a 1 entre o menor e o
  maior peso da escala, ponderado pelo peso da pergunta em cada classificação; o percentual (0–100) sai por classificação e por
  quem respondeu (paciente sobre si, paciente sobre o outro, cada responsável, terapeuta). Faixas: abaixo de 25% **Não
  demonstrado**; 25–50% **Desenvolvimento inicial**; 50–75% **Em desenvolvimento**; 75% ou mais **Consolidada**.
- Diferenças entre as visões (ex.: o paciente se vê melhor do que a família o vê) são material para conversa, não erro.
- **Tempo de resposta** (Teste › Qualidade; algumas dezenas de respostas por pergunta): mediana do tempo com a aba visível até a
  escolha, somando revisões, e parcela de respostas rápidas demais (menos de 1,5 s). Aponta perguntas confusas ou não lidas.
- **Correlação** de Spearman (padrão, por postos, mais robusta com poucos dados) ou Pearson (linear) entre habilidades, uma
  observação por paciente na visão escolhida (Escola › Análise; aparece com 5 pessoas por par; ~30 para ler com segurança).
- **Grupos de perfis** (Escola › Análise): k-means de 2 a 5 grupos sobre os percentuais, com mapa em PCA e silhueta (diz se os
  grupos são de fato distintos). Calcula com 6 pacientes com metade das habilidades respondidas; ~50 para os grupos significarem
  algo. Só a equipe vê.
- **Cobertura mínima**: menos de 3 perguntas ativas por classificação e público usado = medida sem validade estatística.
`;

/** Arquitetura técnica: só para o dono. */
const ARQUITETURA = `
# Arquitetura (só para o dono)
- Next.js 15 (App Router, React 19, TypeScript) inteiro na Vercel; o projeto publica a branch main em https://skillertri.vercel.app.
  Telas são Server Components; alterações são Server Actions (app/painel/*-actions.ts) que validam permissão (lib/auth.ts:
  canSeePatient, managesPatients, canManageTeam, testsFor) e devolvem { ok, message | error }.
- Dados no **Prisma Postgres**: cada entidade do app (schools, users, invites, tests, patients, sessions, forms) é uma linha JSON da
  tabela Record (coleção + id), lida e gravada por lib/db.ts (readDb/updateDb) e lib/db-prisma.ts (gravação só do que mudou, advisory
  lock serializando as instâncias). Dados antigos são migrados na leitura (só acrescentam campos). Tabelas próprias do assistente:
  AssistantConversation, AssistantGap e AssistantMemory. Migrações em prisma/migrations, aplicadas no deploy (vercel-build: prisma generate, migrate
  deploy, next build).
- Arquivos (logo e destaque das landings, símbolos das respostas) no **Vercel Blob** privado (testes/<id>/landing/ e
  testes/<id>/simbolos/), servidos por /arquivos/...
- Sessão por cookie assinado (HMAC, 12 h). Senhas com hash. Links de resposta são códigos aleatórios.
- Arquivos principais: lib/types.ts (modelo de dados), lib/forms.ts (sorteio e formulários), lib/scoring.ts (percentuais e
  faixas), lib/stats.ts (correlação, k-means, PCA, silhueta), lib/symbols.ts, lib/landing-files.ts, app/r (questionário),
  app/painel (painel) e lib/assistant/ (este assistente: ferramentas, conhecimento, contexto por pessoa e skills).
- IA: Claude via ANTHROPIC_API_KEY. O assistente da plataforma roda no LangChain (@langchain/anthropic): Sonnet com as ferramentas
  ligadas às mesmas Server Actions das telas, contexto montado por pessoa (papel, escola, carteira e memória) e skills em segundo
  plano com Haiku (memória da pessoa). O assistente de cada teste usa o SDK da Anthropic direto.
  Tabelas: AssistantConversation, AssistantGap e AssistantMemory.
- Pedidos de mudança de código, layout ou nova funcionalidade não são feitos por você: explique que viram trabalho de
  desenvolvimento.
`;

/** Só para quem vê o log de Lacunas (LACUNAS_USER_IDS). Os demais nem sabem que ele existe. */
const LACUNAS = `
# Lacunas (só para você)
- Aba **Lacunas** em Configurações (/painel/configuracoes/lacunas): log do que o assistente não soube responder ou fazer em todas as conversas da plataforma, com
  quem pediu (papel e escola), tipo, tema e motivo; temas mais pedidos; marcar como resolvida (com nota), ignorada ou reabrir.
- Quem anota é uma skill separada (lib/assistant/skills/registrar-falha.ts) que lê cada resposta depois de enviada; o assistente da
  conversa não anota nem comenta isso.
`;

export function platformKnowledge(opts: { role: string; seesGaps: boolean }) {
  return [PRODUTO, opts.role === "admin" ? ARQUITETURA : "", opts.seesGaps ? LACUNAS : ""].filter(Boolean).join("\n");
}

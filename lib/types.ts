/** Quem responde uma pergunta. */
export type RespondentRole = "paciente" | "responsavel" | "terapeuta";

/** Sobre quem a pessoa responde em um bloco do formulário. */
export type About = "si" | "outro" | "paciente";

export type GuardianKind = "mae" | "pai";

export type SymbolSource = "ia" | "auto" | "manual";

export type ScaleOption = {
  id: string;
  label: string;
  description: string;
  /** Peso (valor numérico) atribuído a esta resposta. */
  weight: number;
  /** Símbolo da resposta: é nele que a pessoa toca para responder. */
  symbolSvg?: string;
  symbolSource?: SymbolSource;
};

export type Scale = {
  id: string;
  name: string;
  options: ScaleOption[];
};

/** Classificação da pergunta: agrupa perguntas para somar as respostas no resultado. */
export type Category = {
  id: string;
  name: string;
  description: string;
  order: number;
};

export type Question = {
  id: string;
  text: string;
  categoryId: string;
  scaleId: string;
  /** Para quem a pergunta pode ser feita. */
  targets: RespondentRole[];
  /** Para o paciente: se pode ser usada sobre si, sobre o outro, ou ambos. */
  perspectives: ("si" | "outro")[];
  /** Peso da pergunta no cálculo da classificação principal (categoryId). */
  weight: number;
  /**
   * Peso da resposta nas outras classificações (habilidades), além da principal: uma pergunta raramente
   * mede uma habilidade só. Ausente ou sem a classificação = não conta nela.
   */
  skillWeights?: Record<string, number>;
  active: boolean;
  order: number;
};

/** Quantas perguntas sortear para um papel, sobre quem, e de quais classificações. */
export type StageRule = {
  id: string;
  role: RespondentRole;
  count: number;
  about: About;
  /** Vazio = todas as classificações. */
  categoryIds: string[];
  /** Texto mostrado antes do bloco. Aceita {paciente}. */
  instruction: string;
};

export type Stage = {
  id: string;
  name: string;
  /** "inicial" acontece uma vez no início do tratamento; "sessao" se repete a cada sessão. */
  kind: "inicial" | "sessao";
  rules: StageRule[];
};

export type Test = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  scales: Scale[];
  categories: Category[];
  questions: Question[];
  stages: Stage[];
  /** Instruções para a IA desenhar os símbolos deste teste. Vazio = DEFAULT_SYMBOL_PROMPT. */
  symbolPrompt?: string;
  /** Página pública do teste (/teste/<slug>). */
  landing?: TestLanding;
  /**
   * Teste excluído: some do painel, das escolas e da landing, mas continua guardado para o histórico
   * dos pacientes que o usavam (arquivados na exclusão).
   */
  deletedAt?: string;
  /** O que a exclusão desfez, para a restauração devolver: escolas que aplicavam o teste, pacientes arquivados e a landing. */
  deletedFrom?: { schoolIds: string[]; patientIds: string[]; landing?: TestLanding };
};

export type TestLanding = {
  slug: string;
  published: boolean;
  /** Frase manuscrita acima do título. */
  slogan: string;
  headline: string;
  lead: string;
  /** Título e texto da seção das classificações. Vazio = "N classificações". */
  skillsTitle: string;
  skillsLead: string;
  /** Imagens da marca do teste, enviadas para a pasta do teste no Blob (/arquivos/testes/<id>/landing/...). Vazio = sem imagem. */
  logoUrl: string;
  heroImageUrl: string;
  /** Botão "Falar com a equipe": link https://wa.me/<número>?text=<mensagem>. Vazio = CONTACT_URL. */
  contactUrl: string;
};

/** Escola: uma equipe de terapeutas que aplica alguns testes da plataforma aos próprios pacientes. */
export type School = {
  id: string;
  name: string;
  /** Testes que a escola pode aplicar. */
  testIds: string[];
  active: boolean;
  createdAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  /**
   * admin = dono do Skiller (plataforma). Na escola: gestor = administrador da escola (pacientes, equipe, links);
   * terapeuta = responde os testes e analisa os próprios pacientes.
   */
  role: "admin" | "gestor" | "terapeuta";
  /** Escola do gestor ou do terapeuta. O dono não pertence a escola. */
  schoolId?: string;
  active: boolean;
  createdAt: string;
  /** Link permanente do terapeuta para responder os formulários de todos os seus pacientes. */
  token: string;
};

/** Link de convite para alguém criar a própria conta. */
export type Invite = {
  id: string;
  /** Vazio = quem abrir o link informa o próprio e-mail. */
  email: string;
  name: string;
  role: User["role"];
  schoolId?: string;
  token: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
};

export type Guardian = {
  id: string;
  kind: GuardianKind;
  name: string;
  email?: string;
  phone?: string;
  token: string;
};

export type Patient = {
  id: string;
  name: string;
  birthDate?: string;
  email?: string;
  testId: string;
  /** Escola onde o teste é aplicado; o terapeuta é sempre dessa escola. */
  schoolId: string;
  therapistId: string;
  guardians: Guardian[];
  token: string;
  /** Token usado pelo terapeuta para responder sobre este paciente. */
  therapistToken: string;
  notes?: string;
  createdAt: string;
  archived?: boolean;
};

export type Session = {
  id: string;
  patientId: string;
  number: number;
  date: string;
  notes?: string;
  createdAt: string;
};

export type FormItem = {
  questionId: string;
  about: About;
  block: number;
};

export type FormBlock = {
  about: About;
  instruction: string;
};

export type Answer = {
  optionId: string;
  /** Cópia do peso no momento da resposta, para o histórico não mudar se a escala for editada. */
  weight: number;
  min: number;
  max: number;
  answeredAt: string;
  /** Tempo ativo (aba visível) que a pessoa levou para responder, somando as revisões, em ms. */
  elapsedMs?: number;
  /** Quantas vezes a resposta foi trocada depois da primeira escolha. */
  changes?: number;
};

export type Form = {
  id: string;
  patientId: string;
  testId: string;
  stageId: string;
  stageName: string;
  /** 0 = início do tratamento. */
  sessionNumber: number;
  respondent: { role: RespondentRole; guardianId?: string };
  blocks: FormBlock[];
  items: FormItem[];
  /** Chave = índice do item. */
  answers: Record<string, Answer>;
  createdAt: string;
  finishedAt?: string;
};

export type Db = {
  version: 2;
  schools: School[];
  users: User[];
  invites: Invite[];
  tests: Test[];
  patients: Patient[];
  sessions: Session[];
  forms: Form[];
};

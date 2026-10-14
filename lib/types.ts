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
};

export type Scale = {
  id: string;
  name: string;
  options: ScaleOption[];
};

/** Classificação da pergunta (ex.: uma das 12 habilidades). */
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
  /** Peso da pergunta no cálculo da classificação. */
  weight: number;
  active: boolean;
  order: number;
  symbolSvg?: string;
  symbolSource?: SymbolSource;
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
};

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "terapeuta";
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

export type Settings = {
  anthropicApiKey?: string;
  /** Necessário quando a chave não está vinculada a um workspace (cabeçalho anthropic-workspace-id). */
  anthropicWorkspaceId?: string;
  model: string;
  symbolPrompt: string;
};

export type Db = {
  version: 2;
  settings: Settings;
  users: User[];
  invites: Invite[];
  tests: Test[];
  patients: Patient[];
  sessions: Session[];
  forms: Form[];
};

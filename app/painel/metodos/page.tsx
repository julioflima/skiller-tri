import { requirePageUser } from "@/lib/auth";
import { IRT_MIN_PERSONS, IRT_STABLE_PERSONS } from "@/lib/irt";

type Method = { name: string; what: string; where: string; data: string };

/** Métodos em uso: onde cada um aparece no painel. */
const IN_USE: Method[] = [
  {
    name: "Percentual e faixas",
    what: "Soma ponderada das respostas de cada habilidade, de 0 a 100%, com faixas descritivas. É o resultado principal.",
    where: "Paciente › Resultados",
    data: "Um formulário",
  },
  {
    name: "TRI: escala gradual de Andrich (Rasch)",
    what: "Estima o nível da pessoa (θ) levando em conta quão difícil é cada pergunta. Todas as perguntas de uma habilidade compartilham os mesmos limiares de escala.",
    where: "Paciente › Resultados (θ) e Teste › Qualidade (calibração)",
    data: `${IRT_MIN_PERSONS} pessoas por habilidade para calcular; ~${IRT_STABLE_PERSONS} para ficar estável`,
  },
  {
    name: "Ajuste das perguntas (infit/outfit)",
    what: "Mostra se a pergunta se comporta como o modelo espera. Fora de 0,7–1,3: ambígua, medindo outra coisa ou redundante.",
    where: "Teste › Qualidade",
    data: `~${IRT_STABLE_PERSONS} pessoas por habilidade`,
  },
  {
    name: "Tempo de resposta",
    what: "Mediana do tempo até a escolha e parcela de respostas rápidas demais. Aponta perguntas confusas ou não lidas.",
    where: "Teste › Qualidade",
    data: "Algumas dezenas de respostas por pergunta",
  },
  {
    name: "Correlação de Spearman e Pearson",
    what: "Se duas habilidades sobem e descem juntas entre os pacientes. Spearman é o padrão por ser mais robusto com poucos dados.",
    where: "Escola › Análise",
    data: "5 pessoas por par para aparecer; ~30 para ler com segurança",
  },
  {
    name: "Grupos de perfis (k-means, PCA, silhueta)",
    what: "Separa os pacientes em 2 a 5 grupos com “pegadas” parecidas e projeta num mapa. A silhueta diz se os grupos são de fato distintos.",
    where: "Escola › Análise",
    data: "6 pacientes para calcular; ~50 para os grupos significarem algo",
  },
];

/** Outros modelos da família TRI, ainda não implementados. */
const IRT_FAMILY: Method[] = [
  {
    name: "Partial Credit Model (Masters)",
    what: "Rasch com limiares próprios por pergunta. Serve quando uma opção quase nunca é marcada em algumas perguntas e muito em outras.",
    where: "Quando várias perguntas ficarem fora de 0,7–1,3 ou com limiares fora de ordem",
    data: "~150 pessoas por habilidade",
  },
  {
    name: "Modelo multinível (por quem responde)",
    what: "Considera que paciente, mãe/pai e terapeuta usam a escala de jeitos diferentes (ex.: a família sempre mais generosa) e corrige isso antes de comparar as visões.",
    where: "Quando as visões do retrato 360 divergirem de forma sistemática",
    data: "~70 pessoas por visão",
  },
  {
    name: "Graded Response (Samejima) e Generalized Partial Credit (Muraki)",
    what: "Acrescentam a discriminação: algumas perguntas medem melhor que outras e passam a pesar mais. Ajudam a decidir o que cortar ou reescrever.",
    where: "Revisão do instrumento",
    data: "250–500 pessoas por habilidade",
  },
  {
    name: "TRI multidimensional e bifatorial",
    what: "Verifica se as habilidades são de fato distintas, se uma pergunta mede duas delas ou se há um fator geral por trás de todas.",
    where: "Validação do teste",
    data: "Centenas de pessoas",
  },
  {
    name: "Nominal (Bock) e desdobramento (GGUM)",
    what: "Para opções sem ordem ou itens de concordância em que concordar demais também é sinal. Não se aplicam às escalas atuais.",
    where: "—",
    data: "—",
  },
];

export default async function MethodsPage() {
  await requirePageUser();
  return (
    <div className="stack">
      <section>
        <h1 style={{ marginBottom: 6 }}>Métodos</h1>
        <p className="muted" style={{ margin: 0 }}>
          Os métodos que o Skiller usa para ler as respostas, onde cada um aparece e quantos dados precisa para ser confiável. Os resultados ficam
          dentro de cada paciente, escola e teste; esta página só explica.
        </p>
      </section>

      <MethodTable title="Em uso" methods={IN_USE} whereLabel="Onde aparece" />

      <section className="card alt" id="tri">
        <h2>Família TRI</h2>
        <p className="muted small">
          TRI (Teoria de Resposta ao Item) é uma família de modelos. Em vez de só somar as respostas, eles estimam o nível da pessoa e as propriedades de
          cada pergunta ao mesmo tempo. O Skiller usa o modelo de Andrich, o que exige menos dados. Com poucas respostas, o percentual continua
          sendo o resultado principal e a TRI aparece como estimativa experimental.
        </p>
        <h3>Como decidir o próximo modelo</h3>
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Até ~{IRT_STABLE_PERSONS} pessoas por habilidade: manter o modelo atual; os números são exploratórios.</li>
          <li>Com ~{IRT_STABLE_PERSONS}–150: olhar o ajuste em Teste › Qualidade. Muitas perguntas desajustadas → Partial Credit; poucas → o atual basta.</li>
          <li>Se paciente, família e terapeuta divergirem sempre na mesma direção → modelo multinível, antes dos demais.</li>
          <li>Com centenas de pessoas: Graded Response e multidimensional, para revisar o próprio teste.</li>
        </ol>
      </section>

      <MethodTable title="Outros modelos da família TRI" methods={IRT_FAMILY} whereLabel="Quando usar" note="Ainda não implementados." />
    </div>
  );
}

function MethodTable({ title, methods, whereLabel, note }: { title: string; methods: Method[]; whereLabel: string; note?: string }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Método</th>
              <th>O que faz</th>
              <th>{whereLabel}</th>
              <th>Dados necessários</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.name}>
                <td>
                  <strong>{m.name}</strong>
                </td>
                <td className="small">{m.what}</td>
                <td className="small">{m.where}</td>
                <td className="small faint">{m.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

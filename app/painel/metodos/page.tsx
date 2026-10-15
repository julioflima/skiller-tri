import { requirePageUser } from "@/lib/auth";

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
    </div>
  );
}

function MethodTable({ title, methods, whereLabel }: { title: string; methods: Method[]; whereLabel: string }) {
  return (
    <section className="card">
      <h2>{title}</h2>
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

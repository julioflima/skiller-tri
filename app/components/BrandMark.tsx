/** Nome da plataforma em texto, enquanto ela não tem logo próprio. `large` nas telas de entrada, `light` sobre fundo escuro. */
export function BrandMark({ large = false, light = false }: { large?: boolean; light?: boolean }) {
  return (
    <span className={`wordmark${large ? " lg" : ""}${light ? " light" : ""}`}>
      Skiller<b>TRI</b>
    </span>
  );
}

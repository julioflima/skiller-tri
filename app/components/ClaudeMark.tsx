// A marca do Claude: raios de tamanhos diferentes em volta do centro (a mesma do miimo). A cor vem do CSS: terracota do Skiller
// dentro da janela e no botão índigo.
const rays = [[0, 10.5], [31, 9], [58, 10.8], [92, 9.4], [121, 10.6], [150, 8.8], [182, 10.4], [212, 9.2], [241, 10.9], [272, 9], [301, 10.2], [331, 9.6]] as const;
const markPath = rays
  .map(([angle, length]) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return `M12 12L${(12 + Math.cos(radians) * length).toFixed(2)} ${(12 + Math.sin(radians) * length).toFixed(2)}`;
  })
  .join("");

export function ClaudeMark() {
  return (
    <svg className="claude-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d={markPath} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

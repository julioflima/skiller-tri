/* eslint-disable @next/next/no-img-element */

/** Logo KAY12: mascote em círculo + wordmark. `large` nas telas de entrada. */
export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <>
      <img src="/brand/avatar.png" alt="" className={`brand-avatar${large ? " lg" : ""}`} />
      <img src="/brand/wordmark.svg" alt="KAY12" className={`brand-wordmark${large ? " lg" : ""}`} />
    </>
  );
}

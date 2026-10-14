"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Result } from "@/lib/result";
import { useToast } from "./useToast";

/** Botão que chama uma ação de servidor já vinculada (`acao.bind(null, ...)`), mostra o resultado e atualiza a página. */
export function ActionButton({
  action,
  confirmText,
  className = "btn ghost sm",
  children,
  disabled,
}: {
  action: () => Promise<Result>;
  confirmText?: string;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <>
      {toast.node}
      <button
        type="button"
        className={className}
        disabled={pending || disabled}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => {
            const res = await action();
            if (!res.ok) toast.show(res.error);
            else if (res.message) toast.show(res.message);
            router.refresh();
          });
        }}
      >
        {pending ? "…" : children}
      </button>
    </>
  );
}

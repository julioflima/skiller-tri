"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Mostra um link com botões de copiar, abrir e ver o QR code. O caminho é relativo; a origem vem do navegador.
 * Com `message`, o texto copiado é a mensagem seguida do link, pronto para colar no WhatsApp.
 * Em celulares com a tela de compartilhar do sistema, o botão de copiar a abre em vez de copiar.
 * `label` identifica a pessoa no QR code (título da janela e nome do arquivo baixado).
 */
export function CopyLink({ path, message, label }: { path: string; message?: string; label?: string }) {
  const [origin, setOrigin] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
    const mobile = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setCanShare(typeof navigator.share === "function" && mobile);
  }, []);
  const url = `${origin}${path}`;
  const text = message ? `${message}\n\n${url}` : url;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fora de HTTPS (ex.: celular acessando o IP da máquina) não há clipboard API
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    try {
      // só `text`, com o link dentro: o WhatsApp descarta o texto quando recebe `url` separado
      await navigator.share(message ? { text } : { url });
    } catch (e) {
      // cancelar a tela de compartilhar não é erro; outras falhas caem na cópia
      if ((e as Error).name !== "AbortError") await copy();
    }
  }

  async function openQr() {
    if (!qr) setQr(await QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: "#2f3a4a", light: "#ffffff" } }));
    dialog.current?.showModal();
  }

  const fileName = `qrcode-${(label ?? "link").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;

  return (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
      <code className="link-code" title={url}>
        {url}
      </code>
      <button type="button" className="btn ghost sm icon-btn" onClick={canShare ? share : copy} aria-label={canShare ? "Compartilhar link" : "Copiar link"}>
        <Icon name={copied ? "check" : canShare ? "share" : "copy"} />
        <span className="icon-btn-label">{copied ? "Copiado" : canShare ? "Compartilhar" : "Copiar"}</span>
      </button>
      <button type="button" className="btn ghost sm icon-btn" onClick={openQr} aria-label="Ver QR code" title="QR code">
        <Icon name="qr" />
      </button>
      <a className="btn ghost sm icon-btn" href={path} target="_blank" rel="noreferrer" aria-label="Abrir link" title="Abrir">
        <Icon name="external" />
      </a>

      <dialog ref={dialog} className="qr-dialog" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <div className="row spread" style={{ flexWrap: "nowrap" }}>
          <strong>{label ? `QR code de ${label}` : "QR code"}</strong>
          <button type="button" className="btn ghost sm icon-btn" onClick={() => dialog.current?.close()} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        {qr && <img src={qr} alt={`QR code do link ${url}`} className="qr-img" />}
        <p className="faint small" style={{ margin: 0, wordBreak: "break-all" }}>
          {url}
        </p>
        <a className="btn sm icon-btn" href={qr} download={fileName}>
          <Icon name="download" />
          <span>Baixar imagem</span>
        </a>
      </dialog>
    </span>
  );
}

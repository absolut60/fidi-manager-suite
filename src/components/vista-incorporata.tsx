import { useEffect, useRef, type ReactNode } from "react";
import { destinazioneFuoriFinestra } from "@/lib/vista-incorporata";

/** Include i link delle sezioni figlie senza duplicare regole nei singoli tab. */
export function ContenutoIncorporato({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const contenuto = ref.current;
    if (!contenuto) return;
    const aggiorna = () => contenuto.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(link => {
      if (link.hasAttribute("download")) return;
      const destinazione = destinazioneFuoriFinestra(link.href, window.location.href);
      if (!destinazione) return;
      link.href = destinazione;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    aggiorna();
    const observer = new MutationObserver(aggiorna);
    observer.observe(contenuto, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} onClickCapture={e => {
    if (!(e.target instanceof Element)) return;
    const link = e.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.hasAttribute("download")) return;
    const destinazione = destinazioneFuoriFinestra(link.href, window.location.href);
    if (!destinazione) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(destinazione, "_blank", "noopener,noreferrer");
  }}>{children}</div>;
}
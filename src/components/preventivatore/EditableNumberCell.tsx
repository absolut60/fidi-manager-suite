import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { parseNumeroIt } from "@/lib/numero-it";

/**
 * Cella numerica editabile in stile foglio di calcolo.
 * Accetta decimali con virgola (formato italiano).
 * Commit on blur o Enter; rollback su Escape.
 */
export function EditableNumberCell({
  value,
  onCommit,
  className,
  disabled,
  placeholder,
  suffix,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void | Promise<void>;
  className?: string;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
}) {
  const toDisplay = (v: number | null | undefined) =>
    v == null ? "" : String(v).replace(".", ",");

  const [local, setLocal] = useState<string>(toDisplay(value));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setLocal(toDisplay(value));
  }, [value, editing]);

  async function commit() {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed === "" && (value == null || Number.isNaN(value as number))) return;
    const num = trimmed === "" ? null : parseNumeroIt(trimmed);
    if (trimmed !== "" && num === null) {
      setLocal(toDisplay(value));
      return;
    }
    if (num === value) return;
    // Conferma se si sta azzerando/svuotando un valore precedente > 0
    const prev = typeof value === "number" ? value : NaN;
    const sta_azzerando = (num === null || num === 0) && Number.isFinite(prev) && prev !== 0;
    if (sta_azzerando) {
      const ok = window.confirm(
        `Vuoi davvero azzerare questo valore? (era ${String(prev).replace(".", ",")})`,
      );
      if (!ok) {
        setLocal(toDisplay(value));
        return;
      }
    }
    try {
      setBusy(true);
      await onCommit(num);
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      placeholder={placeholder ?? "—"}
      disabled={disabled || busy}
      onChange={(e) => {
        setEditing(true);
        setLocal(e.target.value.replace(/[^0-9.,\-]/g, ""));
      }}
      onFocus={(e) => e.currentTarget.select()}
      onDragStart={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setLocal(toDisplay(value));
          setEditing(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "w-full bg-transparent px-1.5 py-1 text-right font-mono text-xs outline-none",
        "rounded border border-transparent hover:border-input focus:border-ring focus:bg-card",
        busy && "opacity-50",
        suffix && "pr-4",
        className,
      )}
    />
  );
}

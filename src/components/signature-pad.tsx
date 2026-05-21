import { useRef, useState, useEffect, useCallback } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SignaturePadHandle = {
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
};

export function SignaturePad({
  onChange,
  height = 200,
}: {
  onChange?: (empty: boolean) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const [, force] = useState(0);

  const getCtx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2;
    return ctx;
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    ctx?.scale(dpr, dpr);
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    const ctx = getCtx();
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = getCtx();
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
    if (empty.current) {
      empty.current = false;
      onChange?.(false);
      force((x) => x + 1);
    }
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    empty.current = true;
    onChange?.(true);
    force((x) => x + 1);
  }

  // Espongo via attributi data-* per consumer esterno tramite ref
  return (
    <div className="space-y-2">
      <div
        className="relative rounded-md border bg-white"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          data-empty={empty.current}
          data-signature-canvas="true"
        />
        {empty.current && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
            Firma qui ✍️
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <Eraser className="size-3.5 mr-1" /> Cancella
        </Button>
      </div>
    </div>
  );
}

// Helper to extract dataURL from a canvas referenced by data attribute
export function getCanvasDataURL(container: HTMLElement): string | null {
  const canvas = container.querySelector<HTMLCanvasElement>(
    '[data-signature-canvas="true"]',
  );
  if (!canvas) return null;
  if (canvas.dataset.empty === "true") return null;
  return canvas.toDataURL("image/png");
}

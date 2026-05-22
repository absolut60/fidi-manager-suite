import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

type Props = {
  path?: string | null;
  url?: string | null;
  size?: "sm" | "default";
  variant?: "outline" | "default";
  className?: string;
  children?: ReactNode;
};

function extractPath(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/documenti-privacy\/(.+?)(\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function PdfPrivacyButton({ path, url, size = "sm", variant = "outline", className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const finalPath = path || extractPath(url);

  async function open() {
    if (!finalPath) {
      toast.error("PDF non disponibile");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("documenti-privacy")
        .createSignedUrl(finalPath, 60 * 60);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "Errore");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore apertura PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={open} disabled={loading} className={className}>
      <Download className="size-4 mr-1" /> {children ?? "PDF"}
    </Button>
  );
}

import { Link, useRouter, useCanGoBack } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackButton({
  fallbackTo,
  fallbackLabel,
  iconOnly = false,
  className,
}: {
  className?: string;
  fallbackTo: "/" | "/richieste-interne" | "/clienti" | "/lead" | "/richieste" | "/task" | "/articoli" | "/kit" | "/preventivatore" | "/eventi";
  fallbackLabel: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (iconOnly) {
    return canGoBack ? (
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        title="Indietro"
        onClick={() => router.history.back()}
      >
        <ArrowLeft className="size-4" />
      </Button>
    ) : (
      <Button variant="ghost" size="icon" className="shrink-0" title={fallbackLabel} asChild>
        <Link to={fallbackTo}>
          <ArrowLeft className="size-4" />
        </Link>
      </Button>
    );
  }

  if (canGoBack) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("gap-1.5 -ml-2", className)}
        onClick={() => router.history.back()}
      >
        <ArrowLeft className="size-4" /> Indietro
      </Button>
    );
  }

  return (
    <Button asChild variant="ghost" size="sm" className={cn("gap-1.5 -ml-2", className)}>
      <Link to={fallbackTo}>
        <ArrowLeft className="size-4" /> {fallbackLabel}
      </Link>
    </Button>
  );
}

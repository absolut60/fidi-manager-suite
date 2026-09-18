import { Link, useRouter, useCanGoBack } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({
  fallbackTo,
  fallbackLabel,
}: {
  fallbackTo: "/clienti" | "/lead";
  fallbackLabel: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (canGoBack) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2"
        onClick={() => router.history.back()}
      >
        <ArrowLeft className="size-4" /> Indietro
      </Button>
    );
  }

  return (
    <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
      <Link to={fallbackTo}>
        <ArrowLeft className="size-4" /> {fallbackLabel}
      </Link>
    </Button>
  );
}

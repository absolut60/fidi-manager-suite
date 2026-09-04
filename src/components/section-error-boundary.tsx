import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Etichetta della sezione (es. nome del tab) mostrata nel messaggio. */
  nome?: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * Error boundary LOCALE: isola il crash di una singola sezione/tab in modo che
 * l'errorComponent globale di __root non "butti fuori" dall'intera pagina.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SectionErrorBoundary]", {
      sezione: this.props.nome ?? "(senza nome)",
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      cause: (error as { cause?: unknown })?.cause,
      componentStack: info?.componentStack,
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Errore nel caricamento di questa sezione
          {this.props.nome ? ` (${this.props.nome})` : ""} — riprova.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => this.setState({ error: null })}
        >
          <RefreshCw className="size-4" /> Riprova
        </Button>
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Dettagli tecnici
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-[11px] text-muted-foreground select-text">
            {`${error.name}: ${error.message}\n\n${error.stack ?? ""}`}
          </pre>
        </details>
      </div>
    );
  }
}

import { createFileRoute } from "@tanstack/react-router";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";

export const Route = createFileRoute("/fm72-verifica-temporanea")({
  component: () => <NuovoPreventivoDialog open onOpenChange={() => {}} soggettoIniziale={{ tipo: "cliente", id: "11111111-1111-4111-8111-111111111111", etichetta: "Cliente di collaudo" }} />,
});
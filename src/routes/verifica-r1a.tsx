import { createFileRoute } from "@tanstack/react-router";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";
export const Route = createFileRoute("/verifica-r1a")({ component: () => <NuovoPreventivoDialog open onOpenChange={() => {}} /> });
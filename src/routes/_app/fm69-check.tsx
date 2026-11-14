import { createFileRoute } from "@tanstack/react-router";
import { CanaleConversazione } from "@/components/chat/canale-conversazione";
export const Route = createFileRoute("/_app/fm69-check")({ component: Check });
function Check() { return <CanaleConversazione canaleId="11111111-1111-4111-8111-111111111111" /> }

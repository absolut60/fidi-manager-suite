import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_cliente",
  title: "Dettaglio cliente",
  description:
    "Restituisce l'anagrafica completa di un cliente (dati identificativi, contatti, bancari, fido, contabili) per l'ID fornito.",
  inputSchema: {
    cliente_id: z.string().uuid().describe("UUID del cliente"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ cliente_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non autenticato" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("clienti")
      .select("*")
      .eq("id", cliente_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Cliente non trovato" }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { cliente: data },
    };
  },
});

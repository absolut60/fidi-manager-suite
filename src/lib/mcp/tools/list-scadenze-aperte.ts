import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_scadenze_aperte",
  title: "Scadenze aperte del cliente",
  description:
    "Elenca le scadenze aperte (importo_residuo > 0) di un cliente, ordinate per data scadenza crescente.",
  inputSchema: {
    cliente_id: z.string().uuid().describe("UUID del cliente"),
    limit: z.number().int().min(1).max(200).optional().describe("Numero massimo di righe (default 100)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ cliente_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non autenticato" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("scadenze")
      .select(
        "id, data_scadenza, numero_documento, importo_scadenza, importo_residuo, giorni_ritardo, tipologia_scadenza, in_legale, sollecitato",
      )
      .eq("cliente_id", cliente_id)
      .gt("importo_residuo", 0)
      .order("data_scadenza", { ascending: true })
      .limit(limit ?? 100);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { scadenze: data ?? [] },
    };
  },
});

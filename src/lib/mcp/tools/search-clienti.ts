import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_clienti",
  title: "Cerca clienti",
  description:
    "Cerca clienti per ragione sociale o partita IVA. Restituisce id, ragione sociale, partita IVA, città e store.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Testo da cercare in ragione sociale o partita IVA"),
    limit: z.number().int().min(1).max(50).optional().describe("Numero massimo di risultati (default 20)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Non autenticato" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const max = limit ?? 20;
    const q = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("clienti")
      .select("id, ragione_sociale, partita_iva, citta, store_id")
      .or(`ragione_sociale.ilike.%${q}%,partita_iva.ilike.%${q}%`)
      .order("ragione_sociale", { ascending: true })
      .limit(max);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { clienti: data ?? [] },
    };
  },
});

import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchClientiTool from "./tools/search-clienti";
import getClienteTool from "./tools/get-cliente";
import listScadenzeAperteTool from "./tools/list-scadenze-aperte";

// L'issuer OAuth deve essere l'host Supabase diretto (il proxy .lovable.cloud
// viene rifiutato per mismatch RFC 8414). Il project ref è l'unico valore
// stabile tra dev e produzione.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fidi-manager-suite-mcp",
  title: "FidiManager MCP",
  version: "0.1.0",
  instructions:
    "Strumenti per FidiManager (Gruppo MADE): cerca clienti, leggi l'anagrafica e le scadenze aperte del portafoglio a cui l'utente ha accesso. Ogni chiamata rispetta i permessi RLS dell'utente OAuth collegato.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchClientiTool, getClienteTool, listScadenzeAperteTool],
});

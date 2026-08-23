import type { Database } from "@/integrations/supabase/types";

export type StatoTask = Database["public"]["Enums"]["stato_task"];

export const STATI: StatoTask[] = ["da_fare", "in_corso", "fatto", "annullato"];

export const STATO_LABEL: Record<StatoTask, string> = {
  da_fare: "Da fare",
  in_corso: "In corso",
  fatto: "Fatto",
  annullato: "Annullato",
};

export const STATO_BADGE: Record<
  StatoTask,
  { variant: "default" | "secondary" | "outline"; className: string }
> = {
  da_fare: { variant: "secondary", className: "" },
  in_corso: { variant: "default", className: "" },
  fatto: { variant: "outline", className: "border-emerald-500 text-emerald-600" },
  annullato: { variant: "secondary", className: "line-through opacity-70" },
};

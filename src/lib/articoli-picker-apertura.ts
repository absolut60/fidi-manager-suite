import { z } from "zod";

export const inputArticoliAperturaPicker = z.object({
  cantiere_id: z.string().uuid().optional(),
  sede_giacenza: z.string().uuid().optional(),
});
export function parametriArticoliAperturaPicker(input: z.infer<typeof inputArticoliAperturaPicker>) {
  return {
    ...(input.cantiere_id ? { _cantiere_id: input.cantiere_id } : {}),
    ...(input.sede_giacenza ? { _sede_giacenza: input.sede_giacenza } : {}),
  };
}
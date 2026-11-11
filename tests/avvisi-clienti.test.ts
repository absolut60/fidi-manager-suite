import { describe, expect, test } from "bun:test";
import { messaggioConteggi, raggruppaAvvisiPerNegozio, type RigaAvvisoNegozio } from "@/lib/avvisi-clienti";

type Riga = RigaAvvisoNegozio & { id: string };
const riga = (id: string, storeId: string | null = "A"): Riga => ({ id, store_id: storeId, negozio: storeId ? `SEDE ${storeId}` : null });

describe("avvisi clienti a orario fisso", () => {
  test("variazioni e alert dello stesso negozio producono un solo giro email/notifica", () => {
    const gruppi = raggruppaAvvisiPerNegozio(
      [riga("bloccato"), riga("sbloccato")],
      [riga("alert-1"), riga("alert-2"), riga("alert-3")],
    );
    expect(gruppi.size).toBe(1);
    const gruppo = gruppi.get("A")!;
    expect(gruppo.variazioni).toHaveLength(2);
    expect(gruppo.alertFidi).toHaveLength(3);
    expect(messaggioConteggi(1, 1, 0, 0, gruppo.alertFidi.length)).toBe("1 bloccato, 1 sbloccato, 3 alert fidi");
  });

  test("un negozio senza novità non produce alcun avviso", () => {
    expect(raggruppaAvvisiPerNegozio([], []).size).toBe(0);
  });

  test("righe senza negozio non producono avvisi", () => {
    expect(raggruppaAvvisiPerNegozio([riga("v", null)], [riga("a", null)]).size).toBe(0);
  });

  test("alert e variazioni di negozi diversi restano separati", () => {
    const gruppi = raggruppaAvvisiPerNegozio([riga("v", "A")], [riga("a", "B")]);
    expect([...gruppi.keys()].sort()).toEqual(["A", "B"]);
    expect(gruppi.get("A")!.alertFidi).toHaveLength(0);
    expect(gruppi.get("B")!.variazioni).toHaveLength(0);
  });
});

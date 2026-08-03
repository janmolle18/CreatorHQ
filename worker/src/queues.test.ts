import { describe, expect, it } from "vitest";
import type { Queue } from "bullmq";
import { reiheEinmalEin } from "./queues.ts";

// reiheEinmalEin ist die einzige Stelle, über die alle Sweeps Arbeit einreihen.
// Geht sie kaputt, steht die gesamte Pipeline still — und zwar lautlos, weil
// ein Takt ohne Arbeit genauso aussieht wie ein kaputter.

/** Minimale Queue-Attrappe, die mitschreibt, wie sie aufgerufen wurde. */
function attrappe(bestehenderZustand?: string) {
  const protokoll = {
    hinzugefuegt: [] as Array<{ name: string; daten: unknown; jobId: string }>,
    entfernt: 0,
    /** true, wenn `add` mit korrektem `this` lief — siehe Test unten. */
    thisWarGesetzt: false,
  };

  const queue = {
    async getJob(_id: string) {
      if (!bestehenderZustand) return null;
      return {
        getState: async () => bestehenderZustand,
        remove: async () => {
          protokoll.entfernt += 1;
        },
      };
    },
    async add(this: unknown, name: string, daten: unknown, opts: { jobId: string }) {
      // BullMQs echtes `add` beginnt mit `this.trace(…)`. Wird die Methode vom
      // Objekt gelöst, ist `this` undefined und der Aufruf wirft.
      protokoll.thisWarGesetzt = this === queue;
      protokoll.hinzugefuegt.push({ name, daten, jobId: opts.jobId });
    },
  };

  return { queue, protokoll };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Attrappe statt echter Queue
type FakeQueue = Queue<any, unknown, any>;

describe("reiheEinmalEin", () => {
  it("ruft add am Objekt auf, nicht losgelöst davon", async () => {
    const { queue, protokoll } = attrappe();
    await reiheEinmalEin(queue as unknown as FakeQueue, "download", { a: 1 }, "job-1");

    // Der eigentliche Punkt: Ohne gebundenes `this` wirft BullMQ sofort, und
    // sämtliche Sweeps reihen nichts mehr ein.
    expect(protokoll.thisWarGesetzt).toBe(true);
    expect(protokoll.hinzugefuegt).toEqual([
      { name: "download", daten: { a: 1 }, jobId: "job-1" },
    ]);
  });

  it("lässt wartende Arbeit in Ruhe", async () => {
    const { queue, protokoll } = attrappe("waiting");
    await reiheEinmalEin(queue as unknown as FakeQueue, "download", { a: 1 }, "job-1");
    expect(protokoll.hinzugefuegt).toHaveLength(0);
    expect(protokoll.entfernt).toBe(0);
  });

  it("räumt eine Leiche weg und reiht neu ein", async () => {
    // Der Grund für diese Funktion: BullMQ verwirft ein `add` mit bekannter
    // Kennung stillschweigend — auch wenn der Auftrag längst gescheitert ist.
    const { queue, protokoll } = attrappe("failed");
    await reiheEinmalEin(queue as unknown as FakeQueue, "publish", { b: 2 }, "job-2");
    expect(protokoll.entfernt).toBe(1);
    expect(protokoll.hinzugefuegt).toHaveLength(1);
  });

  it("behandelt einen fertigen Auftrag wie eine Leiche", async () => {
    const { queue, protokoll } = attrappe("completed");
    await reiheEinmalEin(queue as unknown as FakeQueue, "render", { c: 3 }, "job-3");
    expect(protokoll.entfernt).toBe(1);
    expect(protokoll.hinzugefuegt).toHaveLength(1);
  });
});

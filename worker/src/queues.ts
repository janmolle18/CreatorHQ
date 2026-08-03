import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "./env.ts";

// BullMQ-Verbindung (ioredis-URL). maxRetriesPerRequest: null ist für BullMQ Pflicht.
export const connection: ConnectionOptions = {
  url: env.redisUrl,
  maxRetriesPerRequest: null,
} as unknown as ConnectionOptions;

// Eine Queue pro Pipeline-Stufe → getrennte Concurrency-Steuerung.
export const QUEUE = {
  download: "download",
  clip: "clip",
  render: "render",
  publish: "publish",
  analytics: "analytics",
  comments: "comments",
  briefing: "briefing",
  maintenance: "maintenance",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

// ── Job-Payloads ──
//
// JEDER Auftrag trägt den Mandanten. Ohne ihn kann der Worker die
// Mandantengrenze nicht setzen, und die Datenbankregeln liefern ihm null
// Zeilen — der Auftrag meldete Erfolg, ohne etwas getan zu haben.
export interface MandantenJob {
  tenantId: string;
}
export interface SourceVideoJob extends MandantenJob {
  sourceVideoId: string;
}
export interface ClipJob extends MandantenJob {
  clipId: string;
}
export interface PostJob extends MandantenJob {
  postId: string;
  /**
   * Von Hand ausgelöst („Jetzt posten" im Dashboard). Solche Jobs laufen auch
   * bei ausgeschalteter Automatik — ein bewusster Klick ist keine Automatik.
   * Der Minuten-Tick reiht ausschließlich Jobs ohne dieses Kennzeichen ein.
   */
  manual?: boolean;
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 3600 * 24, count: 1000 },
  removeOnFail: { age: 3600 * 24 * 7 },
};

function makeQueue<T>(name: QueueName) {
  return new Queue<T, unknown, string>(name, { connection, defaultJobOptions });
}

export const queues = {
  download: makeQueue<SourceVideoJob | ClipJob>(QUEUE.download),
  clip: makeQueue<SourceVideoJob | ClipJob>(QUEUE.clip),
  render: makeQueue<ClipJob>(QUEUE.render),
  publish: makeQueue<PostJob>(QUEUE.publish),
  analytics: makeQueue<MandantenJob>(QUEUE.analytics),
  comments: makeQueue<MandantenJob>(QUEUE.comments),
  briefing: makeQueue<MandantenJob>(QUEUE.briefing),
  maintenance: makeQueue<Record<string, unknown>>(QUEUE.maintenance),
};

/**
 * Job einreihen, ohne laufende Arbeit zu verdoppeln — und ohne an einer Leiche
 * hängenzubleiben.
 *
 * Die Sweeps verwenden feste Job-IDs, damit derselbe Post nicht bei jedem Takt
 * neu eingereiht wird. BullMQ verwirft ein `add` mit bekannter ID aber
 * **stillschweigend**, und mit der Aufbewahrung (fertig 24 h, gescheitert 7
 * Tage) galt das auch für längst beendete Jobs: Ein endgültig gescheiterter
 * Post, den man wieder einplant, ging bis zu sieben Tage nicht raus — ohne
 * Fehlermeldung, ohne Spur.
 *
 * Deshalb hier ausdrücklich: Wartet oder läuft ein Job mit dieser ID, bleibt
 * es dabei. Ist er fertig oder gescheitert, wird die Leiche entfernt und neu
 * eingereiht.
 */
export async function reiheEinmalEin<TData, TName extends string>(
  queue: Queue<TData, unknown, TName>,
  name: TName,
  data: TData,
  jobId: string
): Promise<void> {
  const bestehend = await queue.getJob(jobId);
  if (bestehend) {
    const zustand = await bestehend.getState();
    if (zustand !== "completed" && zustand !== "failed") return;
    await bestehend.remove();
  }
  // BullMQs `ExtractNameType` lässt sich in einer generischen Funktion nicht
  // auflösen; die Signatur oben sichert Name und Daten an den Aufrufstellen
  // bereits ab, deshalb hier eine eng begrenzte Typangabe.
  //
  // Umgetypt wird die QUEUE, nicht die Methode. Wer stattdessen
  // `const add = queue.add` schreibt, löst die Methode von ihrem Objekt: In
  // `add` ist `this` dann undefined, und BullMQs erste Zeile (`this.trace(…)`)
  // wirft. Sichtbar wird das nur, wenn wirklich etwas eingereiht werden soll —
  // ein Takt ohne Arbeit sieht genauso aus wie ein kaputter.
  const eingang = queue as unknown as {
    add(n: TName, d: TData, o: { jobId: string }): Promise<unknown>;
  };
  await eingang.add(name, data, { jobId });
}

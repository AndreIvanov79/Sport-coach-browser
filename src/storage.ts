import type { Landmark, Report, ReportSummary, Sample, Sport } from "./types.ts";
// v2: compact landmark storage (Float32Array) + a separate summaries store so the history list
// never loads every saved point. v1 records are migrated in place on upgrade.
const DB_VERSION = 2;
type Packed = { times: Float64Array; lm: Float32Array; count: Uint8Array; width: number; height: number; reasons: (string | null)[] };
type Stored = Omit<Report, "samples"> & { samples?: Sample[]; packed?: Packed };
export function pack(samples: Sample[]): Packed {
 const lm = new Float32Array(samples.length * 33 * 5), count = new Uint8Array(samples.length), times = new Float64Array(samples.length);
 samples.forEach((s, i) => {
  times[i] = s.time; count[i] = s.landmarks.length ? 33 : 0;
  s.landmarks.slice(0, 33).forEach((p, k) => { const o = (i * 33 + k) * 5; lm[o] = p.x; lm[o + 1] = p.y; lm[o + 2] = p.z; lm[o + 3] = p.visibility; lm[o + 4] = p.presence ?? 1; });
 });
 return { times, lm, count, width: samples[0]?.width ?? 0, height: samples[0]?.height ?? 0, reasons: samples.map(s => s.reason ?? null) };
}
export function unpack(p: Packed): Sample[] {
 return Array.from(p.times, (time, i) => {
  const landmarks: Landmark[] = [];
  for (let k = 0; k < p.count[i]; k++) { const o = (i * 33 + k) * 5; landmarks.push({ x: p.lm[o], y: p.lm[o + 1], z: p.lm[o + 2], visibility: p.lm[o + 3], presence: p.lm[o + 4] }); }
  const reason = p.reasons[i] as Sample["reason"] | null;
  return { time, width: p.width, height: p.height, landmarks, ...(reason ? { reason } : {}) };
 });
}
export function summarize(r: Report | Stored): ReportSummary {
 const key: Record<string, number | null> = {};
 for (const s of r.scalars ?? []) key["s." + s.id] = s.value;
 for (const m of r.metrics ?? []) key["m." + m.id] = m.value;
 const count = r.sport === "boxing" ? r.strikes?.length ?? null : r.sport === "rg" ? r.rg?.events.length ?? null : r.cycles?.length ?? null;
 return { id: r.id, sport: r.sport, fileName: r.fileName, createdAt: r.createdAt, duration: r.duration, coverage: r.coverage, exercise: r.exercise ?? "auto", detected: r.exerciseInfo?.detected ?? null, count, key };
}
function database(sport: Sport): Promise<IDBDatabase> {
 return new Promise((resolve, reject) => {
  const req = indexedDB.open("sport-coach-" + sport, DB_VERSION);
  req.onupgradeneeded = event => {
   const db = req.result, tx = req.transaction!;
   if (!db.objectStoreNames.contains("reports")) db.createObjectStore("reports", { keyPath: "id" });
   if (!db.objectStoreNames.contains("summaries")) {
    const summaries = db.createObjectStore("summaries", { keyPath: "id" });
    if ((event as IDBVersionChangeEvent).oldVersion >= 1) {
     const cursor = tx.objectStore("reports").openCursor();
     cursor.onsuccess = () => { const c = cursor.result; if (!c) return; summaries.put(summarize(c.value as Stored)); c.continue(); };
    }
   }
  };
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); req.onblocked = () => reject(new Error("blocked"));
 });
}
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("aborted")); });
export async function saveReport(report: Report): Promise<void> {
 const db = await database(report.sport);
 try {
  const tx = db.transaction(["reports", "summaries"], "readwrite");
  const { samples, ...rest } = report;
  tx.objectStore("reports").put({ ...rest, packed: pack(samples) });
  tx.objectStore("summaries").put(summarize(report));
  await done(tx);
 } finally { db.close(); }
}
export async function loadReport(sport: Sport, id: string): Promise<Report | null> {
 const db = await database(sport);
 try {
  const value = await new Promise<Stored | undefined>((resolve, reject) => { const r = db.transaction("reports").objectStore("reports").get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  if (!value) return null;
  const { packed, ...rest } = value;
  return { ...(rest as Report), samples: packed ? unpack(packed) : value.samples ?? [] };
 } finally { db.close(); }
}
export async function listSummaries(sport: Sport): Promise<ReportSummary[]> {
 const db = await database(sport);
 try {
  const all = await new Promise<ReportSummary[]>((resolve, reject) => { const r = db.transaction("summaries").objectStore("summaries").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
 } finally { db.close(); }
}
export async function deleteReport(sport: Sport, id: string): Promise<void> {
 const db = await database(sport);
 try { const tx = db.transaction(["reports", "summaries"], "readwrite"); tx.objectStore("reports").delete(id); tx.objectStore("summaries").delete(id); await done(tx); } finally { db.close(); }
}
/** Ask the browser not to evict saved history (best effort). */
export async function persistStorage(): Promise<boolean | null> {
 try { if (!navigator.storage?.persist) return null; return (await navigator.storage.persisted()) || await navigator.storage.persist(); } catch { return null; }
}

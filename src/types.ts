export type Sport = 'boxing' | 'fitness' | 'rg';
export type ModelId = 'lite' | 'full' | 'heavy';
export type Lang = 'ru' | 'en' | 'ro';
export type Landmark = { x: number; y: number; z: number; visibility: number; presence?: number };
export type SampleReason = 'no-pose' | 'lost' | 'multiple-people';
/** One analysed video position. `candidates` (all detected people) and their clothing colours `looks` exist only in memory. */
export type Sample = {
 time: number; landmarks: Landmark[]; width: number; height: number;
 reason?: SampleReason; people?: number; candidates?: Landmark[][]; looks?: ({ torso: number[]; legs: number[] | null } | null)[];
};
export type Metric = {
 id: string; unit: string; value: number | null; min: number | null; max: number | null;
 coverage: number; series: (number | null)[];
 /** v1 reports stored text labels; kept optional for compatibility only. */
 label?: string; description?: string;
};
/** A single technique figure (not a time series). `value===null` means honestly not assessable. */
export type Scalar = { id: string; value: number | null; unit: string; digits?: number; reason?: string; time?: number; detail?: string };
export type Tone = 'info' | 'attention' | 'good';
export type FindingKind = 'fault' | 'strength' | 'info' | 'quality';
export type Finding = {
 code: string; tone: Tone; kind?: FindingKind; params?: Record<string, string | number>;
 time?: number; times?: number[]; severity?: number; count?: number; total?: number; focus?: boolean;
 /** v1 compatibility */ title?: string; detail?: string;
};
export type Cycle = { start: number; peak: number; end: number; side?: 'l' | 'r' };
export type Segment = { start: number; end: number; kind: 'active' | 'rest'; reps?: number };
export type ViewKind = 'front' | 'side' | 'oblique' | 'unknown';
export type View = { kind: ViewKind; shoulderRatio: number | null; frontShare: number; sideShare: number };
export type Athlete = { people: number; selection: 'single' | 'auto' | 'user'; seed?: Seed; lostFrames: number; reacquired: number; seedTime?: number };
export type Seed = { index: number; candidate: number };
export type ExerciseInfo = {
 selected: string; detected: string | null; candidates: string[];
 status: 'agree' | 'conflict' | 'unverified' | 'auto' | 'none';
 checks: { check: string; result: 'ok' | 'violated' | 'borderline' | 'unverified'; measured?: number | string }[];
};
export type Rep = {
 index: number; start: number; end: number; peak: number; duration: number;
 toward: number | null; pause: number | null; away: number | null;
 driverMin: number | null; driverMax: number | null; asymmetry: number | null; hipSag: number | null;
 elbowMin: number | null; elbowMax: number | null; trunkMax: number | null;
};
export type Strike = {
 index: number; time: number; side: 'l' | 'r'; limb: 'arm' | 'leg';
 extension: number | null; velocity: number | null; guard: number | null; rotation: number | null; standingKnee: number | null;
};
export type RgAction = 'leap' | 'balance' | 'rotation' | 'flexibility';
export type RgEvent = {
 id: number; action: RgAction; start: number; end: number; peak: number;
 element: string | null; family: string | null; familyTitle: string | null; baseValue: number | null;
 props: Record<string, number | null>; turns: number | null; hold: number | null; holdBounded: boolean;
 checks: { check: string; result: 'ok' | 'violated' | 'unverified'; measured?: number | null }[];
 deductions: { code: string; value: number; status: "estimated" | "review"; params?: Record<string, number | string> }[];
};
export type RgScore = {
 mode: 'routine' | 'element';
 d: { value: number; items: { event: number; element: string; family: string; value: number }[]; missingGroups: string[]; penalty: number };
 e: { total: number; upper: number; review: number; deductions: { event?: number; code: string; value: number; time?: number; status: "estimated" | "review"; params?: Record<string, number | string> }[] };
 notAssessed: string[];
};
export type Reliability = { suspectShare: number; frames: number };
export type Report = {
 version: 2; id: string; sport: Sport; exercise: string; fileName: string; fileSize?: number; fileModified?: number;
 createdAt: string; duration: number; fps: number; threshold: number; model: string; modelId: ModelId;
 source: 'file' | 'camera' | 'live'; decode?: string; samples: Sample[];
 metrics: Metric[]; scalars: Scalar[]; findings: Finding[]; cycles: Cycle[]; segments: Segment[];
 coverage: number; driver: string | null; view: View; athlete: Athlete; exerciseInfo?: ExerciseInfo;
 reps?: Rep[]; strikes?: Strike[]; rg?: { events: RgEvent[]; score: RgScore };
 reliability: Reliability; elapsedMs: number; interrupted: boolean; processedDuration?: number;
};
export type ReportSummary = {
 id: string; sport: Sport; fileName: string; createdAt: string; duration: number; coverage: number;
 exercise: string; detected: string | null; count: number | null; key: Record<string, number | null>;
};
export type ExerciseDef = { id: string; driver: string | null; inverted?: boolean; candidates?: string[]; view?: 'side' | 'front' };
export type Profile = {
 id: Sport; accent: string; defaultFps: number; exercises: ExerciseDef[]; metrics: string[]; tableMetrics: string[];
};
export type ModelInfo = { id: ModelId; file: string; bytes: number };
declare global { const __SPORT__: Sport; const __APP_VERSION__: string; const __MODELS__: ModelInfo[]; }

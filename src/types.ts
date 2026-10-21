export type Sport = 'boxing' | 'fitness' | 'rg';
export type Landmark = { x: number; y: number; z: number; visibility: number; presence?: number };
export type Sample = { time: number; landmarks: Landmark[]; width: number; height: number; reason?: string };
export type Metric = { id: string; label: string; unit: string; description?: string; value: number | null; min: number | null; max: number | null; coverage: number; series: (number | null)[] };
export type Finding = { title: string; detail: string; time?: number; tone: 'info' | 'attention' | 'good' };
export type Cycle = { start: number; peak: number; end: number };
export type Report = {
 version: 1; id: string; sport: Sport; exercise: string; fileName: string; createdAt: string;
 duration: number; fps: number; threshold: number; model: string; samples: Sample[];
 metrics: Metric[]; findings: Finding[]; cycles: Cycle[]; coverage: number;
 driver: string | null; elapsedMs: number; interrupted: boolean;
};
export type Profile = {
 id: Sport; name: string; title: string; subtitle: string; tag: string;
 accent: string; defaultFps: number; exercises: { id: string; label: string; driver: string | null; inverted?: boolean }[];
 metrics: string[]; scope: string; guide: string[];
};
declare global { const __SPORT__: Sport; const __APP_VERSION__: string; }

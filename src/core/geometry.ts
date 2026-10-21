export type Point = { x: number; y: number };
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export function vecAngle(u: Point, v: Point): number | null {
 const d = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
 return d < 1e-8 ? null : Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / d))) * 180 / Math.PI;
}
/** Angle ABC at vertex B in degrees (0..180). */
export const angle = (a: Point, b: Point, c: Point): number | null => vecAngle(sub(a, b), sub(c, b));
export const wrap180 = (d: number) => ((d + 180) % 360 + 360) % 360 - 180;
export const DOWN: Point = { x: 0, y: 1 };
export const UP: Point = { x: 0, y: -1 };

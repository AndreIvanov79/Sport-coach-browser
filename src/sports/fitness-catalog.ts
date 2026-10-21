// Port of qwen36 gym-vl-api-analysis fitness_vlm_prior.EXPECTATIONS (coach heuristics, not a rulebook).
// joint: angle group extreme (min/max = robust P2/P98, range = P98-P2); scalar: segment metric; sig: driver group.
export type Op = "<" | ">" | ">=" | "<=" | "between" | "==" | "in";
export type Pred =
 | { src: "joint"; group: string; field: "min" | "max" | "range"; op: Op; value: number | [number, number]; agg?: "both" }
 | { src: "scalar"; metric: string; field?: "value" | "range"; op: Op; value: number | [number, number] }
 | { src: "sig"; op: "==" | "in"; value: string | string[] };
const J = (group: string, field: "min" | "max" | "range", op: Op, value: number | [number, number], agg?: "both"): Pred => ({ src: "joint", group, field, op, value, agg });
const S = (metric: string, op: Op, value: number | [number, number], field: "value" | "range" = "value"): Pred => ({ src: "scalar", metric, op, value, field });
const D = (op: "==" | "in", value: string | string[]): Pred => ({ src: "sig", op, value });
const LEGS = ["knee", "hip"], ARMS = ["elbow", "shoulder"];
export const EXPECTATIONS: Record<string, Pred[]> = {
 squat: [D("in", LEGS), J("knee", "min", "<", 110), J("hip", "min", "<", 130, "both"), S("hipAsymmetry", "<", 25), S("bodyHorizontal", "<", .3)],
 deadlift: [S("trunkLean", ">", 40), J("knee", "min", "between", [90, 165]), S("bodyHorizontal", "<", .3)],
 lunge: [D("in", LEGS), J("knee", "min", "<", 110), S("hipAsymmetry", ">", 25), S("footSplit", ">", .9)],
 split_squat: [D("in", LEGS), J("knee", "min", "<", 110), S("hipAsymmetry", ">", 25), S("footSplit", ">", .9)],
 good_morning: [D("==", "hip"), S("trunkLean", ">", 40, "range"), J("knee", "range", "<", 30), S("bodyHorizontal", "<", .3)],
 pushup: [S("bodyHorizontal", ">", .5), D("in", ARMS), J("elbow", "min", "<", 110), S("proneSupport", ">", .5), S("wristTravel", "<", .5), J("knee", "min", ">", 140)],
 pullup: [S("handsOverhead", ">", .3), J("elbow", "min", "<", 90), J("elbow", "max", ">", 140), S("bodyHorizontal", "<", .3)],
 overhead_press: [S("handsOverhead", ">", .3), D("in", ARMS), J("elbow", "max", ">", 150), S("trunkLean", "<", 30)],
 bent_over_row: [S("trunkLean", "between", [30, 80]), D("in", ARMS), J("knee", "range", "<", 40), S("bodyHorizontal", "<", .3)],
 bicep_curl: [D("==", "elbow"), J("elbow", "min", "<", 70), J("elbow", "max", ">", 140), S("trunkLean", "<", 30), J("knee", "range", "<", 30)],
 plank: [S("bodyHorizontal", ">", .7), S("hold", ">=", 2), S("proneSupport", ">", .5), S("wristTravel", "<", .5)],
 burpee: [J("knee", "range", ">", 70), S("trunkLean", ">", 50, "range"), S("bodyHorizontal", ">", .1)],
 crunch: [S("bodyHorizontal", ">", .5), S("proneSupport", "<", .4), J("hip", "range", "between", [10, 75]), J("knee", "min", "<", 130), J("knee", "range", "<", 45)],
 situp: [S("bodyHorizontal", ">", .3), S("proneSupport", "<", .4), J("hip", "min", "<", 110), J("hip", "range", ">", 50), J("knee", "min", "<", 130), J("knee", "range", "<", 45)],
 bench_press: [S("bodyHorizontal", ">", .5), D("in", ARMS), J("elbow", "min", "<", 110), J("elbow", "max", ">", 140), J("hip", "range", "<", 25), S("proneSupport", "<", .4)],
 chest_press: [D("in", ARMS), J("elbow", "min", "<", 110), J("elbow", "max", ">", 140), J("knee", "range", "<", 30)],
 lat_pulldown: [S("handsOverhead", ">", .3), J("elbow", "min", "<", 90), J("elbow", "max", ">", 140), S("bodyHorizontal", "<", .3)],
 cable_row: [D("in", ARMS), J("elbow", "min", "<", 90), S("trunkLean", "<", 45), J("knee", "range", "<", 30)],
 // Browser addition: a seated/lying machine press is not a standing squat (no VLM to tell them apart).
 leg_press: [D("in", LEGS), J("knee", "min", "<", 110), J("elbow", "range", "<", 40), S("standing", "<", .5)],
 leg_extension: [D("in", LEGS), J("knee", "max", ">", 150), J("hip", "range", "<", 30)],
 leg_curl: [D("in", LEGS), J("knee", "min", "<", 90), J("hip", "range", "<", 30)],
 dip: [D("in", ARMS), J("elbow", "min", "<", 100), J("elbow", "max", ">", 140), S("handsOverhead", "<", .1), S("bodyHorizontal", "<", .3)],
 tricep_pushdown: [D("==", "elbow"), J("elbow", "max", ">", 150), J("elbow", "min", "<", 100), J("shoulder", "range", "<", 40), S("bodyHorizontal", "<", .3)],
 lateral_raise: [D("==", "shoulder"), J("shoulder", "max", ">", 70), J("elbow", "min", ">", 130), J("knee", "range", "<", 30), S("bodyHorizontal", "<", .3)],
 front_raise: [D("==", "shoulder"), J("shoulder", "max", ">", 70), J("elbow", "min", ">", 130), J("knee", "range", "<", 30), S("bodyHorizontal", "<", .3)],
 side_plank: [S("hold", ">=", 2), S("bodyHorizontal", ">", .4)],
 lying_leg_raise: [S("bodyHorizontal", ">", .5), S("proneSupport", "<", .4), D("==", "hip"), J("hip", "range", ">", 40), J("knee", "min", ">", 120)],
 hanging_leg_raise: [S("handsOverhead", ">", .3), D("==", "hip"), J("hip", "range", ">", 40)],
 superman: [S("bodyHorizontal", ">", .6), D("==", "hip"), J("hip", "range", "between", [10, 60]), J("knee", "range", "<", 40)],
 hyperextension: [D("==", "hip"), S("trunkLean", ">", 30, "range"), J("knee", "range", "<", 25)],
 glute_bridge: [S("bodyHorizontal", ">", .5), S("proneSupport", "<", .4), D("==", "hip"), J("hip", "range", "between", [20, 90]), J("knee", "range", "<", 40)],
 hip_thrust: [S("bodyHorizontal", ">", .5), S("proneSupport", "<", .4), D("==", "hip"), J("hip", "range", "between", [20, 90]), J("knee", "range", "<", 40)],
 kettlebell_swing: [D("in", ["hip", "shoulder"]), S("trunkLean", ">", 40, "range"), J("elbow", "min", ">", 130), J("knee", "range", "<", 45)],
 mountain_climber: [S("bodyHorizontal", ">", .5), D("in", LEGS), J("knee", "range", ">", 60), S("proneSupport", ">", .5), S("wristTravel", "<", .6)],
 jumping_jack: [D("==", "shoulder"), J("shoulder", "range", ">", 60), J("knee", "max", ">", 160), S("bodyHorizontal", "<", .2)],
 wall_sit: [S("hold", ">=", 2), J("knee", "min", "<", 120), J("knee", "range", "<", 25), S("bodyHorizontal", "<", .3)],
 calf_raise: [J("knee", "max", ">", 160), J("knee", "range", "<", 25), J("elbow", "range", "<", 30), S("trunkLean", "<", 25), S("bodyHorizontal", "<", .2)]
};
/** Consistency checks only, never a discriminator (qwen36 _FALLBACK_EXCLUDED). */
export const FALLBACK_EXCLUDED = new Set(["calf_raise"]);
export const ASYMMETRIC = new Set(["lunge", "split_squat"]);
export const ARM_ROM = new Set(["pushup", "bench_press", "chest_press", "overhead_press", "bent_over_row", "bicep_curl", "tricep_pushdown", "pullup", "lat_pulldown", "cable_row", "dip"]);
export const PRONE = new Set(["pushup", "plank", "side_plank", "mountain_climber", "burpee"]);
/** Exercises whose driver angle is meaningful only in a profile (sagittal) view. */
export const SIDE_VIEW = new Set(["squat", "deadlift", "lunge", "split_squat", "good_morning", "pushup", "bicep_curl", "bent_over_row", "dip", "plank", "situp", "crunch", "glute_bridge", "hip_thrust", "kettlebell_swing", "leg_press", "leg_extension", "leg_curl", "wall_sit", "hyperextension", "superman", "bench_press", "cable_row", "tricep_pushdown"]);

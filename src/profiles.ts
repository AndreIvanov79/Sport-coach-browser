import type { Profile, Sport } from "./types.ts";
// Joint and head measurements stay available regardless of movement category.
const body = ["leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftHip", "rightHip", "leftKnee", "rightKnee", "trunk", "headTilt", "headShift", "headHeight"];
export const profiles: Record<Sport, Profile> = {
 fitness: {
  id: "fitness", accent: "#c6ef73", defaultFps: 15,
  exercises: [
   { id: "auto", driver: null },
   { id: "squat", driver: "knee", candidates: ["squat", "wall_sit", "leg_press"] },
   { id: "lunge", driver: "knee", candidates: ["lunge", "split_squat"] },
   { id: "hinge", driver: "hip", candidates: ["deadlift", "good_morning", "kettlebell_swing", "hyperextension"] },
   { id: "pull", driver: "elbow", candidates: ["bent_over_row", "cable_row", "lat_pulldown"] },
   { id: "pullup", driver: "elbow", candidates: ["pullup", "lat_pulldown"] },
   { id: "press", driver: "elbow", inverted: true, candidates: ["overhead_press", "bench_press", "chest_press"] },
   { id: "pushup", driver: "elbow", candidates: ["pushup", "dip"] },
   { id: "curl", driver: "elbow", candidates: ["bicep_curl"] },
   { id: "extension", driver: "elbow", inverted: true, candidates: ["tricep_pushdown"] },
   { id: "raise", driver: "shoulder", inverted: true, candidates: ["lateral_raise", "front_raise"] },
   { id: "leg", driver: "knee", candidates: ["leg_extension", "leg_curl", "leg_press"] },
   { id: "calf", driver: null, candidates: ["calf_raise"] },
   { id: "core", driver: "hip", candidates: ["crunch", "situp", "lying_leg_raise", "hanging_leg_raise", "superman", "glute_bridge", "hip_thrust"] },
   { id: "hold", driver: null, candidates: ["plank", "side_plank", "wall_sit"] },
   { id: "cardio", driver: null, candidates: ["burpee", "mountain_climber", "jumping_jack"] }
  ],
  metrics: [...body, "hipDepth"], tableMetrics: [...body, "hipDepth"]
 },
 boxing: {
  id: "boxing", accent: "#ffb49b", defaultFps: 30,
  exercises: [
   { id: "auto", driver: null },
   { id: "straight", driver: "elbow", inverted: true },
   { id: "hook", driver: null }, { id: "uppercut", driver: null },
   { id: "combination", driver: null }, { id: "bag", driver: null }, { id: "mitts", driver: null },
   { id: "kicks", driver: null }, { id: "defense", driver: null }, { id: "footwork", driver: null }
  ],
  metrics: [...body, "guard", "headOffset"], tableMetrics: [...body, "guard", "headOffset"]
 },
 rg: {
  id: "rg", accent: "#c3b1ff", defaultFps: 15,
  exercises: [
   { id: "auto", driver: null }, { id: "routine", driver: null }, { id: "element", driver: null },
   { id: "balance", driver: null }, { id: "jump", driver: null }, { id: "turn", driver: null },
   { id: "shape", driver: null }, { id: "wave", driver: null }, { id: "steps", driver: null }, { id: "apparatus", driver: null }
  ],
  metrics: [...body, "split", "legLift", "headFoot"], tableMetrics: [...body, "split", "legLift", "headFoot"]
 }
};
/** v1 reports used "free"; it is the automatic mode now. */
export const normalizeExercise = (sport: Sport, id: string) => profiles[sport].exercises.some(e => e.id === id) ? id : "auto";

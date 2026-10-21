// MediaPipe Pose 33-point schema (NOT COCO-WholeBody indices used by qwen36).
export const L = {
 nose: 0, lEyeInner: 1, lEye: 2, lEyeOuter: 3, rEyeInner: 4, rEye: 5, rEyeOuter: 6, lEar: 7, rEar: 8, mouthL: 9, mouthR: 10,
 lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lPinky: 17, rPinky: 18, lIndex: 19, rIndex: 20,
 lThumb: 21, rThumb: 22, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28, lHeel: 29, rHeel: 30, lFoot: 31, rFoot: 32
} as const;
export const N_LANDMARKS = 33;
export const LINKS: [number, number][] = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[15,17],[15,19],[15,21],[17,19],[16,18],[16,20],[16,22],[18,20],[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32],[27,31],[28,32]];
export const CORE = [L.lShoulder, L.rShoulder, L.lHip, L.rHip];
/** Points that must be visible for a "whole body in frame" check. */
export const FRAMING = [L.nose, L.lShoulder, L.rShoulder, L.lWrist, L.rWrist, L.lHip, L.rHip, L.lKnee, L.rKnee, L.lAnkle, L.rAnkle];
export const LIMBS: [number, number][] = [[L.lHip,L.lKnee],[L.lKnee,L.lAnkle],[L.rHip,L.rKnee],[L.rKnee,L.rAnkle],[L.lShoulder,L.lElbow],[L.lElbow,L.lWrist],[L.rShoulder,L.rElbow],[L.rElbow,L.rWrist]];

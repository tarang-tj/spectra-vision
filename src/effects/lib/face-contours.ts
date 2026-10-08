/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Paths through the 478-point face mesh, as landmark indices in drawing
 * order. They follow the published MediaPipe Face Mesh topology. "Left" and
 * "right" are the subject's own left and right, as in the blendshape names. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109, 10,
];
export const LIPS_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37,
  39, 40, 185, 61,
];
export const LIPS_INNER = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82,
  81, 80, 191, 78,
];
export const LEFT_EYE = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388,
  466, 263,
];
export const RIGHT_EYE = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
  33,
];
export const LEFT_BROW = [336, 296, 334, 293, 300];
export const RIGHT_BROW = [107, 66, 105, 63, 70];
/** Iris centre, then two opposite points on the iris ring. */
export const LEFT_IRIS = [473, 474, 476];
export const RIGHT_IRIS = [468, 469, 471];

/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
const RAD = Math.PI / 180;

/** The true angle in degrees between two head directions given as yaw and pitch
 * (forward vector (sin yaw cos pitch, sin pitch, cos yaw cos pitch)). Roll does
 * not change where the head points, so it is not used. */
export function headAngleBetween(
  yaw1: number,
  pitch1: number,
  yaw2: number,
  pitch2: number,
): number {
  const dot =
    Math.sin(yaw1 * RAD) *
      Math.cos(pitch1 * RAD) *
      Math.sin(yaw2 * RAD) *
      Math.cos(pitch2 * RAD) +
    Math.sin(pitch1 * RAD) * Math.sin(pitch2 * RAD) +
    Math.cos(yaw1 * RAD) *
      Math.cos(pitch1 * RAD) *
      Math.cos(yaw2 * RAD) *
      Math.cos(pitch2 * RAD);
  return Math.acos(Math.min(1, Math.max(-1, dot))) / RAD;
}

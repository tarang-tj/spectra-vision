/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the Pictures block says about where things stand: what the stage is
// showing when that is not a room picture, and the one next step from an
// empty panel to a finished room. Pure, so every stage of the way is tested.

/** What the stage shows, when it is not one of the room's pictures. */
export function stageSays(
  kind: "demo" | "image" | "video" | "camera" | null,
  frozen: boolean,
): string {
  if (kind === "demo")
    return "The stage shows the demo picture, which is not a picture of your room and cannot be kept as one.";
  if (kind === "image")
    return "The stage shows an uploaded picture that is not in this room. Keep this picture adds it.";
  if (kind === "video" || kind === "camera")
    return frozen
      ? `The stage shows a frozen ${kind === "camera" ? "camera" : "video"} frame that is not in this room. Keep this frame as a picture adds it.`
      : `The stage shows a moving ${kind === "camera" ? "camera" : "video"} picture, which cannot be one of the room's pictures. Freeze it, then press Keep this frame as a picture.`;
  return "The stage shows no picture.";
}

export type Progress = {
  /** Pictures in the room, and whether the stage shows one of them. */
  pictures: number;
  onStage: boolean;
  /** The picture on the stage has its reference solved. */
  ready: boolean;
  /** The Room tool is the one chosen. */
  roomTool: boolean;
  /** Names of the pictures not on the plan although they have a reference. */
  off: string[];
  /** Names of the pictures with no reference yet. */
  bare: string[];
  corners: number;
  closed: boolean;
  /** The outline has its numbers. */
  measured: boolean;
};

/** The next thing to do, in one or two sentences. */
export function nextStep(p: Progress): string {
  if (!p.pictures)
    return "Next: press Add picture for the first photo of the room. A photo already on the stage is added with Keep this picture.";
  if (!p.onStage)
    return "Next: press a thumbnail above to put one of the room's pictures on the stage.";
  if (!p.ready)
    return "Next: tap the four corners of the reference in the picture on the stage. Until then the Room tool is greyed out.";
  if (!p.roomTool)
    return p.corners
      ? "Next: choose Room under What to measure to go on with the room."
      : "Next: choose Room under What to measure. It joins these pictures into one plan: you tap the room's floor corners, in whichever picture shows each.";
  if (p.bare.length)
    return `Next: ${p.bare[0]} has no reference yet. Press its thumbnail and tap the four corners of the reference there.`;
  if (p.off.length)
    return `Next: ${p.off[0]} is not on the plan. Show it, then mark two points that are also marked in a picture on the plan: press Mark in this picture beside each, in the Room section below, and tap the same spot.`;
  if (!p.closed)
    return p.corners < 3
      ? p.pictures < 2
        ? "Next: tap the floor corners this picture shows, in order round the room, then press Add picture for the corners it does not show."
        : "Next: tap the room's floor corners in order round the room, switching pictures for the corners each does not show."
      : "Next: tap any corners still missing, then press Close outline in the Room section below.";
  return p.measured
    ? "The room is outlined: its area, walls and plan are in the Room section below. Save room keeps it."
    : "Next: read the Room section below: it says why the outline has no numbers yet.";
}

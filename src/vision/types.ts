export type Mode = "objects" | "body" | "hands";
export type Point = { x: number; y: number; z?: number; visibility?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Detection = { label: string; score: number; box: Box };
export type VisionResult = {
  mode: Mode;
  generation: number;
  time: number;
  latency: number;
  detections: Detection[];
  landmarks: Point[][];
  handedness: string[];
};
export type Track = Detection & {
  id: number;
  lastSeen: number;
  trail: Point[];
};
export type Source = {
  element: HTMLImageElement | HTMLVideoElement;
  kind: "demo" | "image" | "video" | "camera";
  label: string;
  generation: number;
};
export const COLORS = ["#a4ffd9", "#67aaff", "#ae94fa", "#ffd18d", "#ff8ab4"];
export const MODE_LABELS: Record<Mode, string> = {
  objects: "Object detection",
  body: "Body tracking",
  hands: "Hand tracking",
};

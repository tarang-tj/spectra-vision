/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  cameraRequests,
  facingOf,
  grantedOf,
  grantedText,
  mirrorFor,
  openCamera,
  recoveryNote,
  triesNextRung,
} from "../src/vision/camera-start";

const named = (name: string, message = "") =>
  Object.assign(new Error(message), { name });

/** A stand-in for the browser's cameras: `cameras` are the ones that exist,
 * and every request is recorded. A camera is found by exact id, else by the
 * side asked for, else the first one, as a browser does. */
function device(
  cameras: { id: string; label: string; facing?: string }[],
  refuse?: Error,
) {
  const asked: unknown[] = [];
  const getUserMedia = async (c: MediaStreamConstraints) => {
    asked.push(c.video);
    if (refuse) throw refuse;
    const video = c.video === true ? {} : (c.video as MediaTrackConstraints),
      id = (video.deviceId as { exact?: string } | undefined)?.exact,
      side = (video.facingMode as { ideal?: string } | undefined)?.ideal,
      camera = id
        ? cameras.find((x) => x.id === id)
        : (cameras.find((x) => x.facing === side) ?? cameras[0]);
    if (!camera) throw named(id ? "OverconstrainedError" : "NotFoundError", "");
    const track = {
      label: camera.label,
      getSettings: () => ({
        deviceId: camera.id,
        facingMode: camera.facing,
        width: 720,
        height: 1280,
        frameRate: 29.97,
      }),
    };
    return { getVideoTracks: () => [track] } as unknown as MediaStream;
  };
  return { asked, getUserMedia };
}
const PHONE = [
  { id: "front", label: "Front Camera", facing: "user" },
  { id: "back", label: "Back Camera", facing: "environment" },
];

describe("the camera request ladder", () => {
  it("asks for the front side, then for anything, when nothing was chosen", () => {
    expect(cameraRequests({})).toEqual([
      {
        rung: "facing",
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: "user" },
        },
      },
      { rung: "any", video: true },
    ]);
  });
  it("puts an exact id first and never last, and never asks for a side as exact", () => {
    const list = cameraRequests({ deviceId: "a", facing: "environment" });
    expect(list.map((r) => r.rung)).toEqual(["chosen", "facing", "any"]);
    expect(list[0].video).toMatchObject({ deviceId: { exact: "a" } });
    expect(list[1].video).toMatchObject({
      facingMode: { ideal: "environment" },
    });
    expect(JSON.stringify(list)).not.toContain('"facingMode":{"exact"');
  });
  it("tries the camera that was live after a chosen one, but not after a flip", () => {
    expect(
      cameraRequests({ deviceId: "a", previousId: "b" }).map((r) => r.rung),
    ).toEqual(["chosen", "previous", "facing", "any"]);
    expect(
      cameraRequests({ deviceId: "a", previousId: "a" }).map((r) => r.rung),
    ).toEqual(["chosen", "facing", "any"]);
    expect(
      cameraRequests({ facing: "environment", previousId: "b" }).map(
        (r) => r.rung,
      ),
    ).toEqual(["facing", "any"]);
  });
  it("moves down a rung only for a camera that is not there", () => {
    expect(triesNextRung("OverconstrainedError")).toBe(true);
    expect(triesNextRung("NotFoundError")).toBe(true);
    for (const name of ["NotAllowedError", "NotReadableError", "AbortError"])
      expect(triesNextRung(name)).toBe(false);
  });
});

describe("opening a camera", () => {
  it("starts the rear camera of a phone when the rear side is asked for", async () => {
    const phone = device(PHONE),
      opened = await openCamera({ facing: "environment" }, phone.getUserMedia);
    expect(opened.rung).toBe("facing");
    expect(opened.granted).toEqual({
      deviceId: "back",
      label: "Back Camera",
      facing: "environment",
      width: 720,
      height: 1280,
      frameRate: 30,
    });
    expect(phone.asked).toHaveLength(1);
  });
  it("comes back to the camera that was live when the chosen one has gone", async () => {
    const phone = device(PHONE),
      opened = await openCamera(
        { deviceId: "unplugged", previousId: "back" },
        phone.getUserMedia,
      );
    expect(opened.rung).toBe("previous");
    expect(opened.granted.deviceId).toBe("back");
    expect(phone.asked).toHaveLength(2);
  });
  it("falls back to the remembered side when a remembered id has gone", async () => {
    const opened = await openCamera(
      { deviceId: "old-id", facing: "environment", remembered: true },
      device(PHONE).getUserMedia,
    );
    expect(opened.rung).toBe("facing");
    expect(opened.granted.deviceId).toBe("back");
  });
  it("stops at a refusal instead of asking again", async () => {
    const phone = device(PHONE, named("NotAllowedError", "Permission denied"));
    await expect(
      openCamera({ deviceId: "back", facing: "user" }, phone.getUserMedia),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(phone.asked).toHaveLength(1);
  });
  it("gives the last rung's error when no camera exists at all", async () => {
    const none = device([]);
    await expect(
      openCamera({ deviceId: "x" }, none.getUserMedia),
    ).rejects.toMatchObject({ name: "NotFoundError" });
    expect(none.asked).toHaveLength(3);
  });
});

describe("reading what was granted", () => {
  it("takes the side from the browser, then from the name, then admits it does not know", () => {
    expect(facingOf({ facingMode: "environment" }, "Front Camera")).toBe(
      "environment",
    );
    expect(facingOf({}, "Back Ultra Wide Camera")).toBe("environment");
    expect(facingOf({}, "camera2 0, facing back")).toBe("environment");
    expect(facingOf({}, "Front Camera")).toBe("user");
    expect(facingOf({}, "fake_device_0")).toBe("unknown");
    expect(facingOf({}, "Logitech BRIO (046d:085e)")).toBe("unknown");
    // "Background" is not "back".
    expect(facingOf({}, "Background Blur Cam")).toBe("unknown");
    expect(facingOf({ facingMode: "left" }, "")).toBe("unknown");
  });
  it("fills in what a track leaves out", () => {
    expect(grantedOf({}, "")).toEqual({
      deviceId: "",
      label: "Camera",
      facing: "unknown",
      width: 0,
      height: 0,
      frameRate: 0,
    });
  });
  it("never mirrors a camera that faces the room", () => {
    expect(mirrorFor("environment")).toBe(false);
    expect(mirrorFor("user")).toBe(true);
    expect(mirrorFor("unknown")).toBe(true);
  });
  it("words the stage badge from the side and the size", () => {
    expect(
      grantedText({ facing: "environment", width: 720, height: 1280 }),
    ).toBe("CAMERA · REAR · 720×1280");
    expect(grantedText({ facing: "user", width: 1280, height: 720 })).toBe(
      "CAMERA · FRONT · 1280×720",
    );
    expect(grantedText({ facing: "unknown", width: 0, height: 0 })).toBe(
      "CAMERA",
    );
  });
});

describe("saying that another camera started", () => {
  const back = { deviceId: "back", label: "Back Camera" };
  it("says nothing when the camera asked for started", () => {
    expect(recoveryNote({ deviceId: "back" }, "chosen", back)).toBeNull();
    expect(recoveryNote({ facing: "environment" }, "facing", back)).toBeNull();
    expect(recoveryNote({}, "any", back)).toBeNull();
  });
  it("names the camera it went back to after a failed switch", () => {
    expect(
      recoveryNote({ deviceId: "gone", previousId: "back" }, "previous", back),
    ).toBe("That camera is not available. Back on Back Camera.");
  });
  it("says a remembered camera was not there", () => {
    expect(
      recoveryNote({ deviceId: "old", remembered: true }, "facing", back),
    ).toBe("The camera used last time is not available. Using Back Camera.");
  });
  it("says when a flip came back with the same camera", () => {
    expect(
      recoveryNote({ facing: "user", previousId: "back" }, "facing", back),
    ).toBe("There is no other camera to flip to.");
  });
});

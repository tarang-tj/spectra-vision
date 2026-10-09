# SPECTRA

**Reality, augmented.** A camera-first computer vision studio by **Tarang Jammalamadaka**.

[Open the live studio](https://tarang-tj.github.io/spectra-vision/) · [Watch the video demo](https://tarang-tj.github.io/spectra-vision/demo/) · [v1.1.1](https://github.com/tarang-tj/spectra-vision/releases/tag/v1.1.1) · [Ownership and license](LICENSE)

Seven modes run six real vision models on your camera: tracked object boxes, a body skeleton, hand-controlled light painting, a 478-point face mesh, a person cutout, gesture recognition, and body, hands and face together. Ten effects draw on what the models find, and a Lab tab measures how fast they run on your device. Everything runs in your browser.

The 74-second, 1080p video demo was recorded on version 2.0. It shows all seven modes, three effects, the Lab with a benchmark result from a real run, the phone layout and the immersive view, with synthetic neural narration and English captions timed to the speech. The footage is the real app with real inference at real speed; the one cut that skips time (the benchmark's wait) is said aloud and captioned. How it was made is recorded in [asset provenance](docs/design/asset-provenance.md#version-2-video-demo). The version 1.1.1 video stays at [its own address](https://tarang-tj.github.io/spectra-vision/demo/spectra-demo-v1.1.1.mp4).

![SPECTRA desktop interface concept](docs/design/concept-desktop.png)

_Interface design concept. The running app calculates its own detections, scores, tracks and performance measurements. Demo images are still photos processed by the same models used for the camera; they contain no baked-in detection overlays._

## Try it

1. Open the [live studio](https://tarang-tj.github.io/spectra-vision/). The Objects demo starts automatically; allow the model a moment to load.
2. Choose **Start camera**, or **Upload** a local image/video. Camera access requires HTTPS or localhost and browser permission.
3. Switch between **Objects**, **Body**, **Hands**, **Face**, **Segment**, **Gestures** and **Fusion** with the switch at the top or the number keys 1 to 7. For body tracking, step back until your entire body is visible. For hand painting, pinch thumb and index together, move your hand, then release.
4. Turn effects on in the tray under the stage. Each effect that is on and has a strength gets a slider beside its switch. **Constellation** isolates luminous tracking geometry. **Try motion demo**, where a mode has one, loads a labeled, animated pan of a generated still photo; it demonstrates tracking, not a real person changing pose.
5. Use **Record** to save up to 30 seconds of the rendered canvas, effects included. No microphone or screen capture permission is needed. Stop saves the clip and shows it in a result card; changing source or mode also finalizes it.
6. Use **Mirror**, **Pause**, **Screenshot**, **Fullscreen**, **Immersive** or **Export session**. **Demo** restores the sample for the selected mode. **Stop camera** releases its media tracks.
7. Open the **Lab** tab in the right rail to see measured latency and frame rate, or press Ctrl K (Cmd K on a Mac) for the command palette.

Use a current Chrome or Edge browser for the tested path. No account or API key is needed. The six model files total about 49 MB (49,355,063 bytes, the sum of the sizes pinned in [scripts/models.json](scripts/models.json)), plus the WebAssembly runtime. Each mode downloads only its own model, the first time you open it; the first mode, Objects, needs about 7 MB.

## What it does

| Mode     | Actual inference                                                                                 | Visual interaction                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Objects  | EfficientDet-Lite0, common COCO categories                                                       | Class/score boxes, short-lived object IDs, motion trails, selectable detections                             |
| Body     | BlazePose Lite, one person with 33 landmarks                                                     | Glowing skeleton, torso mesh, wrist and ankle motion trails                                                 |
| Hands    | MediaPipe Hand Landmarker, up to two hands with 21 landmarks each                                | Finger skeletons, fingertip rings and pinch-to-paint light trails                                           |
| Face     | MediaPipe Face Landmarker, one face with 478 landmarks, blendshape scores and a head-pose matrix | Face mesh with contours and irises; meters for smile, jaw, brows and blinks; yaw, pitch and roll in degrees |
| Segment  | MediaPipe multiclass selfie segmenter, six classes on a 256 x 256 mask                           | Person cut out from a darkened background; select Background to blur it instead, or a class to tint it      |
| Gestures | MediaPipe Gesture Recognizer, up to two hands, seven named gestures or none                      | Hand skeleton with the gesture and its score; a count of the gestures seen on this source                   |
| Fusion   | The body, hand and face models together, one worker each (one body, two hands, one face)         | One figure built from all three, with each model's own latency on the stage and in the inspector            |

The inspector shows what is in the frame and where. Confidence controls the detection threshold; the motion map shows normalized image coordinates. Inference time, processed frame rate and the Tracked count are measured, rather than illustrative counters. Tracked counts objects, bodies, hands, faces, the segmentation classes found (not counting the background), or the parts Fusion found.

### Effects

Effects are optional layers over a mode's own drawing. The tray lists only the effects that have something to draw from in the current mode. Every effect is driven by model output: none of them plays a scripted animation.

| Effect         | Drawn with | Modes                                  | What it draws from                                                                                           |
| -------------- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Trails         | Canvas 2D  | Objects, Body, Hands, Fusion           | Object tracks, wrists and ankles, pinch-to-paint strokes. On by default                                      |
| Constellation  | Canvas 2D  | All                                    | Dims the source to a dark sky; halos on fingertips                                                           |
| Plasma hands   | WebGL2     | Hands, Gestures, Fusion                | Arcs between fingertips and palms                                                                            |
| Ember trail    | WebGL2     | Body, Hands, Gestures, Fusion          | Particles shed along the measured path of wrists and ankles, or of a hand's wrist and index fingertip        |
| Neon ribbons   | WebGL2     | Body, Hands, Gestures, Fusion          | Ribbons along the recent path of wrists, ankles or fingertips                                                |
| Aura           | WebGL2     | Body, Hands, Gestures, Segment, Fusion | A glow around the segmentation mask, or around tracked bones                                                 |
| Hologram       | WebGL2     | Body, Hands, Gestures, Segment, Fusion | A scanline cutout of the masked person, or of the skeleton                                                   |
| Starfield pull | WebGL2     | Objects, Body, Hands, Gestures, Fusion | Stars drawn toward hands, wrists or tracked objects                                                          |
| Echo           | WebGL2     | Body, Hands, Gestures, Fusion          | Delayed copies of past model results                                                                         |
| Face light     | WebGL2     | Body, Face, Fusion                     | Light on the face mesh that follows the blendshape scores; in Body, on the pose model's eye and mouth points |

The eight WebGL2 effects share one WebGL2 context, composite onto the stage canvas (so Record and Screenshot capture them), and hold still while paused or when reduced motion is requested. In a browser without WebGL2 their switches are disabled and the tray says why; the modes and the two canvas effects keep working. On a software renderer they run, slowly.

### Ruler (beta)

The **Ruler** tab measures real distances on one flat surface, in any mode, with no depth sensor.

1. Lay a reference of known size flat on the surface: a US Letter or A4 sheet, a bank card, or a custom size. A sheet of paper is better than a card for anything room sized.
2. Freeze the frame, or upload a photo, and tap the reference's four corners. Drag a handle to refine it; a loupe magnifies the spot under the pointer.
3. Choose a shape and tap its points on the same surface: a **span** (two points), a **path** (three or more, with each leg and the total) or an **area** (an outline you close, giving area and perimeter).

A **top-down view** redraws the surface to scale from the frozen frame, with the shapes, their labels and a scale bar; anything beyond the horizon or too far away to resolve is left blank. **Save plan** downloads that drawing as an SVG and every measurement as a CSV, with the photo included only if you tick the box. An optional **lens correction** fits one radial term from edges you mark as straight, shows the distance from straight before and after in pixels, and is applied only when it helps.

For a room, one sheet of paper gives a wide error (roughly 10 to 25 percent on a room-sized area), because every measurement is extrapolated from four corners. Lay out a larger reference you have measured once, such as a taped rectangle or a rug, and enter it as a custom size.

Each result is shown as a value plus or minus an error. The value is the distance between your taps. The error is two standard deviations of 400 repeats of the calculation with every tapped point moved by a small random amount (a standard deviation of 1.5 screen pixels), and it covers tap placement only. It does not cover lens distortion, points that are off the surface, or a bent or misprinted reference. The error grows as you measure further from the reference, and the panel warns when a span is more than 10 times the reference's long side. A tap beyond the surface's horizon reads "not measured". On a camera or video the points belong to the frozen frame and are cleared when the picture runs again. Ruler has been checked against synthetic images with known answers, not yet against a tape measure.

### Presence (beta)

The **Presence** tab measures how a person presents on camera, from the Fusion mode's body, hand and face results. Press **Start**, hold still and look at the camera for 5 seconds while it records your baseline and each signal's noise, then speak. It reports:

- the share of time the head points within 15 degrees of the baseline direction (head direction, not eye contact);
- hand movement starts per minute, and how long each hand was in view;
- sway, as the spread of the shoulder midpoint in shoulder widths;
- stillness, as the share of time body motion stays near the noise floor;
- expression change per second across smile, brow raise and jaw open (change, not emotion).

Every figure carries the noise measured during calibration, and the thresholds are shown and adjustable. Head direction and stillness are shares of the time the face or body was actually seen, and each row states that time next to the session's length, so time spent turned away or out of frame is visible instead of dropped. Hand starts show the raw count beside the rate. A signal the models never saw says "not seen". A session ends by itself at 40,000 samples, which is roughly 45 minutes. Presence gives no score, grade or advice. Nothing is saved unless you export the summary as JSON or Markdown. It has been checked on synthetic motion and on the demo input, which shows no face, so the head and expression figures have not yet been checked on a real person.

### Library

The **Library** tab lists every class the loaded models can name: the object detector's 80, and about 1,000 more once **Finer names** is on. Search it, see how many frames each class was seen in this session, and choose which classes Objects shows (only these, or hide these). The stage says when a filter is on, and one button resets it. Finer names runs a second model on the crop of each tracked object, about once a second per object, and shows its name beside the detector's with its own score, never under 30 percent and never in place of the detector's label. Its classes come from ImageNet, which has no "person", so a person may get a clothing name.

### Detection settings

The Inspect tab holds the detection settings for the current mode. **Smooth landmarks** (on by default) steadies drawn body, hand, face and gesture points with a One Euro filter; exported sessions and the measuring panels always keep the raw values. **Precise** loads a larger model on first use where one exists: BlazePose Full (9.4 MB) for Body and Fusion, EfficientDet-Lite2 (12.1 MB) for Objects. It is slower, most of all without a GPU. **People** lets Body follow up to four people, ordered left to right; it does not keep identities between frames. Models now run on the GPU automatically when the browser reports a real graphics card, and on the CPU otherwise; the Lab shows which one is really running and lets you switch.

Objects keep their ids through short misses and crossings, and a new object needs two sightings before it is shown, so one-frame flickers get no id.

### Lab

The **Lab** tab in the right rail measures the app on your device. Nothing it shows is sent anywhere.

- Inference latency of each running model over the last 10 seconds: p50, p95, maximum and sample count, with a chart.
- Processed and rendered frames per second, and dropped frames.
- A stability meter: how much the landmarks or boxes of the running mode move, in source pixels over 3 seconds, raw beside smoothed, and identity switches over the last minute. On a moving input the figure includes the real motion.
- A CPU or GPU switch per model. The line under it says what is really running. A GPU request falls back to CPU, with the reason shown, when the browser draws WebGL in software, has no WebGL2, or does not start the GPU path in bounded time.
- How long each model took to load, and a card for each model in use with its file, size, SHA-256 and license.
- A benchmark you run yourself: choose modes and delegates, then **Run benchmark**. Each run measures 20 seconds after a 2-second warm-up on whatever source is on the stage (a demo source follows the mode being measured) and can be saved as `spectra-benchmark.json` or `spectra-benchmark.md`, with the device, browser, GPU name and protocol recorded in the file.

No benchmark figures are published here: they depend on the device, its load and its power state. Run the benchmark on the machine you care about, idle and on mains power.

### Keyboard

| Keys            | Action                                        |
| --------------- | --------------------------------------------- |
| 1 to 7          | Switch vision mode                            |
| R               | Start or stop recording                       |
| S               | Save a screenshot                             |
| M               | Mirror the view                               |
| E               | Open or close the effects tray                |
| ?               | Open or close help                            |
| Ctrl K or Cmd K | Open the command palette                      |
| Esc             | Close the palette or leave the immersive view |

Shortcuts are ignored while you type in a field and while the command palette is open. The palette lists every mode, every effect of the current mode and the studio actions. **Immersive** fills the window with the stage and keeps a small dock for mode, effects and exit.

### Offline use

The production site registers a service worker. After one visit the studio opens without a network connection: the browser keeps the app shell, the MediaPipe runtime and each model you have actually used. A model you never opened is not downloaded ahead of time and is not available offline. The site also ships a web app manifest and icons, so a browser that offers to install sites can install it; the install prompt itself has not been tested. The service worker is not registered by the development server.

**Recordings** capture the canvas at up to 24 fps, use a supported WebM/MP4 codec, and stop at 30 seconds or approximately 32 MB. Closing the app discards an unfinished recording. The exported clip includes source pixels and effects, without the surrounding interface. Recording stays in browser memory until downloaded.

**Screenshots** save the rendered canvas as PNG. **Exports** save JSON containing the latest processed frames of the current source and mode, model outputs and settings: at most 1,000 frames, and fewer when that many would pass about 8 MB (a Face or Fusion frame holds hundreds of landmarks, so those modes keep a few hundred frames). Non-integer numbers are rounded to five decimal places and the file is written without indentation. They include no image/video data or local filename. Exports reset when source or mode changes. Light-paint strokes and effects are visual and are not included in JSON.

The file's `version` field is the version of this format, not of the app. It is `1.2.0`: version 1.1.0 files have the same fields, without the optional ones below, the size limit or the rounding. Every exported frame has the same five fields as in 1.1.0: `elapsedMs`, `latencyMs`, `detections`, `landmarks` and `handedness`. Format 1.2.0 adds optional fields, present only in the mode that produces them:

| Field          | Mode     | Content                                                                                                                                            |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `face`         | Face     | `blendshapes`: one object per face mapping every blendshape name to its score, 0 to 1. `headPose`: one `{ yaw, pitch, roll }` per face, in degrees |
| `gestures`     | Gestures | One `{ name, score, handedness }` per hand, in the order of `landmarks`. `name` is the model's category name, `None` when it sees no gesture       |
| `segmentation` | Segment  | `width` and `height` of the mask, and `classes`: all six classes with `label`, `pixels`, `share`, `score` and `box`. The masks are not exported    |
| `tasks`        | Fusion   | The latest result of each model, keyed `pose`, `hand` and `face`: `elapsedMs`, `latencyMs`, `delegate`, `landmarks`, `handedness`                  |

In Segment, each entry of `detections` also carries `share` and `pixels`. In Fusion the flat `landmarks` are the pose model's, and a frame is recorded only once the pose model has answered; the hand and face results are under `tasks`.

## Privacy

Camera frames and selected files stay in browser memory; SPECTRA has no image upload endpoint, account, analytics or face identification. Face mode measures the shape and expression of a face; it does not recognize who it is. The static host serves the app, fonts, runtime, models and demo assets and can receive normal HTTP request metadata. The build downloads models from Google's official storage, verifies their SHA-256 hashes, then serves them from the app's own origin.

To open offline, the browser keeps a copy of the app and of each model you have used on this device; clear this site's data in your browser settings to remove them. That cache holds files the site served. It never holds camera frames, uploads, recordings, screenshots or exports.

Camera access starts only after an explicit action. Pause stops inference and freezes playback while retaining camera access; Stop camera, choosing Demo, choosing another source or leaving the app releases the stream. Screenshots and exports download only when requested. Starting a recording authorizes its automatic download when stopped or when the source/mode changes; recordings never leave this device unless you share them.

## Run locally

Requirements: **Node.js 22.12+** and **pnpm 11.8.0**.

```sh
git clone https://github.com/tarang-tj/spectra-vision.git
cd spectra-vision
npm install --global pnpm@11.8.0
pnpm install --frozen-lockfile
pnpm run setup
pnpm run dev
```

Open the localhost URL printed by Vite. Run `pnpm run setup` explicitly: `pnpm setup` is a different, built-in pnpm command. Setup verifies the six models, copies the installed MediaPipe runtime, and assembles dependency license notices. Generated runtime/model files are deliberately excluded from Git.

The checks, in the order the workflow runs them:

```sh
pnpm run format:check
pnpm run check
pnpm run test
PAGES_BUILD=1 pnpm run build
SPECTRA_TEST_PRODUCTION=1 pnpm run test:e2e
```

`check` is the TypeScript build, `test` the unit tests, and `test:e2e` the browser tests. With `SPECTRA_TEST_PRODUCTION=1` they run against the production build served under `/spectra-vision/`, as on the live site, which is the only way the service worker and offline behavior are exercised. Without it, `pnpm run test:e2e` runs the same tests against the development server. `PAGES_BUILD=1 pnpm run preview` serves the production build by hand.

The browser tests use an installed macOS Chrome when available; otherwise install Playwright Chromium with `pnpm exec playwright install chromium`. Set `CHROME_PATH` to use another Chrome executable. Tests use a simulated camera, real model inference and real local file uploads, with the GPU disabled. They do not open your physical camera. Browser-test artifacts go to the OS temporary directory.

The workflow runs these checks before deploying `main` to Pages. Pull requests run the same checks without deployment.

## Architecture

```text
Camera / local file / labeled still or animated demo
    → owned media source with generation token
    → ImageBitmap (one inference frame in flight per worker)
    → one dedicated vision worker per model / self-hosted MediaPipe WASM
    → normalized detections / landmarks / masks, merged per mode
    → mode drawing + effects (canvas 2D and WebGL2) + inspector + Lab + JSON export
```

React and TypeScript manage controls and source ownership. Modes, effects and inspector panels are plugins: one file in `src/modes`, `src/effects` or `src/panels` is one entry, found at build time. A dedicated worker per model performs synchronous inference away from the UI thread; the main thread renders the stage. Results from a replaced source or a previous mode are discarded and never reach a mode's drawing or inspector. Model initialization has a timeout and retry path, and mode changes terminate the previous workers. Model inference is capped at roughly 15 updates/second per model; canvas rendering is capped at roughly 30 draws/second. Actual throughput depends on your device. [docs/architecture.md](docs/architecture.md) has the plugin contracts.

| Path                                                                   | Responsibility                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/modes/`, `src/effects/`, `src/panels/`                            | The seven modes, ten effects and the Inspect, Lab, Library, Ruler and Presence panels |
| `src/vision/useSource.ts`                                              | Permission, file decoding, camera ownership, cancellation and cleanup                 |
| `src/vision/useVision.ts`, `task-runner.ts`, `public/vision-worker.js` | Model lifecycle, bounded frame transfer, delegate fallback, stale-result guards       |
| `src/vision/useSession.ts`, `tracker.ts`                               | Object association, measured frame rate and the frames kept for export                |
| `src/stage/`                                                           | The render loop, draw order, effect lifecycle and the shared WebGL2 layer             |
| `src/gl/`                                                              | WebGL2 kit for effects: shaders, targets, bloom, particles, line batches              |
| `src/shell/`, `src/components/`                                        | Shortcuts, command palette, immersive view, recorder, service worker registration     |
| `src/telemetry/`                                                       | Measured events and the statistics the Lab shows                                      |
| `public/sw.js`                                                         | Offline cache rules                                                                   |
| `scripts/models.json` / `setup-assets.mjs`                             | Pinned model URLs, verified hashes, runtime and notices                               |
| `tests/`                                                               | Unit tests and real-model browser workflows                                           |

## Practical limits

- This is an interactive vision demo, not a calibrated measurement or identity system. Scores are model outputs, not guarantees.
- Lighting, occlusion, motion blur and model category coverage affect detection. Body mode follows one person. Hands can misclassify handedness; hand order can change after occlusion.
- Face follows one face and needs it reasonably large in the frame. Expression meters are blendshape scores from the model, not emotions. The head-pose angles come from the model's transformation matrix and have not been checked against a head turned to known angles.
- Segment uses a model trained on selfie-style framing; on a wide shot it can lose parts of a person. It asks for the GPU. On CPU or a software renderer it runs much slower, and the mask then trails a moving subject.
- Gestures recognizes the model's own seven categories only. Its bundled hand detector is not the one Hands uses and can find fewer hands in the same picture: on the hands demo image it finds one of the two.
- Fusion runs three models at once, each at its own rate, so the parts of the figure can be a few frames apart.
- Object IDs use geometric association, not appearance-based re-identification, and can switch when similar objects cross. Trails retain only bounded recent history.
- Pinching uses aspect-correct thumb–index distance relative to palm length, with hysteresis. It is a gesture heuristic. Reduce glare and keep fingers visible.
- The motion map and exported `x/y` positions are image coordinates; they are not physical depth. Landmark `z` values are model estimates, not calibrated distances.
- Still demos repeatedly infer the same image. Animated demos pan a generated still photo; they do not simulate changing poses or supply prerecorded model results. A live camera or local video provides real scene motion. On slower devices, CPU inference can reduce frame rate. Fullscreen and video codec support vary by browser.
- The tested browser path is Chromium on desktop and a narrow mobile viewport. Physical cameras, mobile Safari and every device/codec combination have not been verified.

## Ownership and third-party rights

**Copyright © 2026 Tarang Jammalamadaka. All rights reserved for the original SPECTRA code and original project material to the extent protected by law.** This is a public portfolio repository, not an MIT-licensed project. Publication does not grant general reuse, modification, redistribution or commercial rights to the original work. See [LICENSE](LICENSE) for the permitted viewing/demo use and rights reserved.

MediaPipe, pretrained model weights, React, icons, fonts and other dependencies retain their respective authors' rights and licenses. They are not claimed as Tarang's original work. Full details, official model references and attribution are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); every deployed build includes Apache-2.0 and installed dependency license texts under `licenses/`.

The interface concept and demo photos were AI-generated for this project. Sample MP4s are locally animated versions of those photos. The narrated video demo records the actual running app; source labels remain visible. Their provenance and prompts are recorded in [docs/design/asset-provenance.md](docs/design/asset-provenance.md).

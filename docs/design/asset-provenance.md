# Asset provenance

These images were generated for SPECTRA with the built-in OpenAI image-generation tool. They contain fictional subjects; the demo photos do not include detection overlays. The interface concept is a design reference, not a screenshot of the running app.

## Desktop interface concept

File: [concept-desktop.png](concept-desktop.png)

Tool mode: generation.

Prompt:

```text
Use case: ui-mockup. Create a complete high fidelity desktop web app concept, 1536 by 1024, for SPECTRA, a stunning real-time computer vision camera playground. Premium dark editorial-tech design, near black #090e11, white typography, electric mint #a4ffd9, fine muted teal borders, clean precise sans-serif. All app UI should be realistic implementation-ready controls. No marketing webpage. No fake accuracy claims. One spacious open screen.
Top bar: small geometric aperture icon and SPECTRA left, center three mode tabs exactly "Objects" "Body" "Hands", right "Processed on your device" with small shield icon, and GitHub icon.
Below: huge left heading exactly "Reality, augmented." and subtitle "Your camera. A new way to see." Right bright mint button camera icon "Start camera", outline button upload icon "Upload".
Main area: dominant 16:10 camera viewport takes 75% width, adjacent narrow open inspector rail takes 25%. Camera viewport contains natural photographic full-body young adult woman wearing loose cobalt blue T-shirt, cream pants, standing with both arms gently extended in a sunlit modern studio, with potted plant, chair and table. It is a clearly labeled "DEMO IMAGE" at top left, no camera falsely live. Actual future object detections visualized with fine mint corner boxes around person, chair, plant, confidence labels, subtle tracking trails. Bottom left viewport status "Demo studio" plus play/pause control; bottom right icon buttons mirror, screenshot, fullscreen. Keep photograph neutral natural color, no tinted wash. Slim top right viewport label "OBJECT DETECTION".
Inspector rail heading "In the frame" three rows with colored dot, "person", "chair", "potted plant"; beneath small minimalist image-plane plot with several dots and caption "Motion map". Beneath a "Confidence" labeled real range slider with value "45%". Beneath switch "Trails" enabled. Bottom note "Switch to Hands. Pinch to paint."
Under viewport a slim unboxed stats strip: labels "Inference" "Frame rate" "Tracked" with illustrative values "— ms" "— fps" "—". Right small icon button "Export session". Bottom left footer "Objects · Body · Hands" and right "No account. No uploads." Small privacy/help icon.
Avoid neon grid backgrounds, decorative orbs, bento tiles, overly rounded cards, tiny dashboard gibberish, robot mascots. UI controls use crisp consistent outlined icons and deliberate 13px text. Photo is the visual hero, large heading secondary hero. Distinctive confident layout with ample breathing room. Everything on one desktop screen at specified aspect ratio, no browser frame.
```

## Studio demo photo

File: [../../public/demo/studio.png](../../public/demo/studio.png)

Tool mode: edit referencing the inspected desktop concept.

Prompt:

```text
Use case: photorealistic-natural. Input image is reference for scene, composition, clothing, lighting, subject and color. Create ONLY the standalone photographic camera-feed asset shown in the reference app, no application interface. Wide 16:10 high-quality realistic photo. Full-body young adult woman in cobalt blue loose T-shirt and cream pants with white sneakers, standing centered in sunlit modern studio, both arms gently extended and hands naturally open, fingers correctly shaped. Entire body and feet visible with margin. Large industrial windows left, big potted green plant lower left, woven wooden chair and small wood table at right, neutral concrete wall, warm daylight shadows. Keep the studio scene and composition closely consistent with the reference's central photo. Remove ALL detection boxes, trails, labels, letters, text on wall art, controls and UI; no overlays. This is a clean photographic source used for actual machine learning object and body detection. Anatomically plausible person, recognizable chair and potted plant, neutral color photography with no tint. No watermarks, no brands.
```

## Hand demo photo

File: [../../public/demo/hands.png](../../public/demo/hands.png)

Tool mode: generation.

Prompt:

```text
Use case: photorealistic-natural. Asset type: genuine CV hand tracking demo photo for a camera app. Horizontal 16:10 composition, close-up photograph of two human hands held up against a simple matte dark teal studio backdrop. Hands fully visible including wrists, anatomically correct five fingers on each hand. Left side one right hand has thumb and index finger tips lightly pinching together, remaining three fingers open. Right side other left hand has palm facing camera and all five fingers comfortably spread. Crisp natural skin texture, soft daylight studio lighting, elegant neutral photo, no digital overlays, no text, no watermarks. Hands occupy most of picture and don't overlap. Realistic proportions, consistent lighting, clear knuckles, clear thumb. This asset is run through a real hand landmark model, so correct anatomy and unobstructed fingers are essential.
```

## Portrait and upper-body crops (version 2)

Files: [../../public/demo/face.png](../../public/demo/face.png) (1120 x 700, SHA-256 `59985e0e2cfc631b9fe438838ff69ac1f3d6abd0978c8e6289b46cb42c5d8904`) and [../../public/demo/face-and-hands.png](../../public/demo/face-and-hands.png) (1280 x 800, SHA-256 `724dcfdcb9e513c296ecc77caf2e40c7c5be8a5c5558b7d1199268bea3053279`).

Both are crops of the studio demo photo above, cut locally with the macOS `sips` tool (the studio photo is 1586 x 992). Nothing new was generated and no real person is shown. `face.png` frames the head and shoulders, which the face model and the selfie-trained segmenter need: in the full photo the face is too small for the face model. `face-and-hands.png` is a wider upper-body crop in which the body, one hand and the face are all large enough for their models. They are the demo inputs of Face and Segment, and of Fusion. The app labels them "Demo studio · portrait crop" and "Demo studio · upper-body crop".

## Animated samples and video demo

`public/demo/studio-motion.mp4` and `hands-motion.mp4` are 12-second, silent H.264 clips made locally with FFmpeg from the generated photos above. Each translates an uncropped 920 × 576 photo slowly across a 1024 × 640 dark canvas at 24 fps, using sinusoidal horizontal and vertical offsets. They contain no changing human poses or baked model geometry. The UI labels them ANIMATED DEMO and still-photo pan.

The current video demo was recorded on version 2.2 and is described under [Version 2.2 video demo](#version-22-video-demo); the version 2.0 video is described under [Version 2 video demo](#version-2-video-demo). The v1.1 video demo shows Objects, Body and Hands only. It captures the actual Chromium-rendered app with real model inference, then adds original title cards, captions and a locally synthesized voiceover. It uses no third-party music or footage. Video assets retain the same original-work rights reservation and third-party exclusions as the project.

## Demo narration

`public/demo/spectra-demo-v1.1.1.mp4` replaces the macOS Samantha narration with locally generated neural speech from [Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M), using its stock American English `af_heart` voice at speed `0.96`. The voice is synthetic and is not a clone of Tarang or any project participant. The original script, app footage and 49-second scene structure are retained.

Generation used `kokoro-onnx` 0.6.1 and the full-precision model from [the upstream model-files-v1.1 release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1). Phoneme timestamps from the model supply the sentence caption boundaries. FFmpeg normalizes the narration to a target of -16 LUFS with a -1.5 dBTP ceiling, resamples it to 48 kHz stereo and encodes AAC audio. The H.264 video stream is copied without re-encoding. There is no background music.

The model is Apache-2.0 and the inference library is MIT; their rights remain with their respective authors. Model weights and inference tooling are used only during narration production and are not shipped with or required by the browser application. The prior system-voice video remains available in the [v1.1.0 release](https://github.com/tarang-tj/spectra-vision/releases/tag/v1.1.0).

## Version 2 video demo

File: [../../public/demo/spectra-demo-v2.0.0.mp4](../../public/demo/spectra-demo-v2.0.0.mp4), 12,782,079 bytes, SHA-256 `99bbef0c9a3cee31b5940b4953c4e8febf2bf11bc4a190d19a04bd27139d7682`. 1920 x 1080, 30 frames a second, 73.57 seconds, H.264 High profile video and 48 kHz stereo AAC audio. Made on 2026-10-08 on an Apple M3 MacBook running macOS 26.5.1. The poster is frame 44.6 s of the video, [../../public/demo/video-poster-v2.0.0.jpg](../../public/demo/video-poster-v2.0.0.jpg) (SHA-256 `d670b5c717385f09eefbf3bb45f207416d82b5a4edff6371de557995f1b42cf0`). The v1.1.1 video, its poster and a copy of its captions (`captions-v1.1.1.vtt`) stay in place.

**Footage.** Every shot but the last is the production build of version 2.0 (`PAGES_BUILD=1 pnpm run build`, served by `vite preview` under `/spectra-vision/`), running in Google Chrome 154.0.8037.98 in headless mode with the GPU on. The page reported its WebGL renderer as `ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)`, so nothing was drawn in software. Playwright 1.61.1 drove the page through the controls a visitor has: the mode buttons, **Try motion demo**, **Clear**, the effect switches, the Lab tab, the CPU and GPU switch, the benchmark checkboxes and **Run benchmark**, and **Immersive**. The first-run tips were marked as seen before recording. Frames came from the Chrome DevTools screencast of the page at 1920 x 1080 (JPEG, quality 90), each with the time Chrome presented it. FFmpeg 8.1.2 placed every frame at its own time and resampled to a constant 30 frames a second, so each shot plays at the speed it happened. The screencast does not show a mouse pointer. Nothing was drawn over the app, and no model result was scripted or replayed.

**Inputs.** The app's own demo sources, with the app's labels (DEMO IMAGE, ANIMATED DEMO) in frame: the generated studio and hands photos, the two crops and the two panned clips described above. No camera and no real person.

**Shots, in order.** Objects on the still demo, then on the panned clip; Body on the panned clip; Hands on the panned clip, where the pinching hand paints as the picture moves; Face on the portrait crop; Segment on the portrait crop; Gestures on the panned hands clip; Fusion on the upper-body crop; Plasma hands switched on in Hands; Hologram switched on in Segment; Aura switched on in Body; the Lab opened in Hands and its hand model switched from CPU to GPU; the benchmark started; the benchmark's result table; the phone layout; the immersive view in Body with Ember trail; a closing card.

**What is not real time.** One cut. The benchmark was a full run of the unmodified protocol (Hands on CPU, then on GPU, 20 s measured after a 2 s warm-up each; about 47 s from the click to "Finished 2 runs."). The video shows its first 1.7 s and then cuts to the finished table. The narration and the captions say so. No shot is sped up or slowed down. The cuts between shots also skip the time each mode took to load.

**Not app footage.** The phone shot is the same build in a 390 x 844 viewport at twice the pixel density, scaled to the frame height and centred on the page background colour. The closing card is original text rendered in the app's font in the same browser and held as a still.

**Narration.** [Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M), stock American English `af_heart` voice, speed `0.96`, generated locally with `kokoro-onnx` 0.4.7 on onnxruntime 1.27.0 (Python 3.14.6) from the full-precision `kokoro-v1.0.onnx` (SHA-256 `7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5`) and `voices-v1.0.bin` (SHA-256 `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`). The voice is synthetic and is not a clone of Tarang or any project participant. There is no background music. The script is 174 words in 20 sentences. Unlike v1.1.1, this model file gives no phoneme timestamps, so each sentence was synthesised on its own and placed on the timeline at a chosen time: the start of every sentence is known to the sample, and its end is its start plus the length of its audio.

**Captions.** `public/demo/captions.vtt` has one cue per spoken sentence. A cue starts when its sentence starts and ends a quarter of a second after the sentence ends, or when the next one starts if that is sooner.

**Audio.** FFmpeg's `loudnorm` brought the narration from -22.4 LUFS to a target of -16 LUFS with a -1.5 dBTP ceiling, then resampled 24 kHz mono to 48 kHz stereo AAC. Measured on the finished file with FFmpeg's `ebur128`: integrated loudness -16.0 LUFS, loudness range 2.4 LU, true peak -4.0 dBFS.

**Encoding.** Each shot was encoded to H.264 as soon as it was recorded and its frames deleted. The shots were then joined, converted from full-range to limited-range BT.709 and encoded once more with `libx264` (`-preset slow -crf 20`, `yuv420p`, `+faststart`).

The model is Apache-2.0 and the inference library is MIT; their rights remain with their authors. They, FFmpeg and Playwright were used only to produce the video and are not shipped with the browser application. The video retains the same original-work rights reservation and third-party exclusions as the project.

## Version 2.2 video demo

File: [../../public/demo/spectra-demo-v2.2.0.mp4](../../public/demo/spectra-demo-v2.2.0.mp4), 12,823,899 bytes, SHA-256 `fd210c32a8bac5e2c4d393cf499a49699d063fb0906cdaad00e18dfc9ae68eec`. 1920 x 1080, 30 frames a second, 93.47 seconds, H.264 High profile video and 48 kHz stereo AAC audio. Made on 2026-10-09 on an Apple M3 MacBook on battery, macOS 26.5.1. The poster is a frame of the Ruler shot from the first render of the video (the Ruler shot was not recaptured), [../../public/demo/video-poster-v2.2.0.jpg](../../public/demo/video-poster-v2.2.0.jpg) (SHA-256 `9375dda465f574a081214bfaed9226e4a56435ecb6c8316b93d57b79a414a3a1`). Its captions are `captions.vtt` (20 cues, SHA-256 `f0d9633d33ad378a31386b7f4c773bdb0ec91d5e975f2ad23b1637c7605dae9a`); the version 2.0 captions stay as `captions-v2.0.0.vtt`, and the version 2.0, 1.1.1 and 1.1.0 videos and their posters stay in place. Two further files are made for sharing and are not in the repository: a version with the captions burned in and the music bed, and the same without the music.

**Footage.** The production build of version 2.2.1 (version 2.2 plus the Presence and badge fixes; `PAGES_BUILD=1 pnpm run build`, served by `vite preview` under `/spectra-vision/`) running in Google Chrome in headless mode with the GPU on. The shots were recorded one after another through the controls a visitor has: the mode switch, the animated demo button, the Library tab (search, Hide these, a class checkbox, Finer names), the effects tray, Upload, the Ruler tab, the Custom reference fields, taps on the picture, Area and Close outline, Save plan, the Presence tab and Start, the Lab tab and the phone layout. The first-run tips were marked as seen. Frames came from the Chrome DevTools screencast, each with the time Chrome presented it, and FFmpeg placed every frame at its own time at 30 frames a second, so each shot plays at the speed it happened. Nothing is sped up or slowed down. No model result was scripted or replayed.

**What is not real time.** The video is made of separate takes joined by hard cuts: the title card, Objects with the Library and Finer names (one take), the montage, the Ruler, Presence, the Lab, the phone layout and the closing card. In the montage the wait for each model to load was cut out (5 of the 6 modes; about 1.3 to 1.6 s each, and Face needed no cut). The narration and the captions say so. Nothing else is cut inside a take. Presence ran its real 5 second calibration, on the Fusion still demo, where head direction and expression change are measured and the right hand reads "not seen". Before the Objects take and the montage were recorded, the animated demo was switched on without being filmed.

**Not app footage.** The title card and the closing card are original text and a mint scan line in the app's colours and font, drawn in the same browser. The phone shot is the same build in a 390 x 844 viewport, scaled to 1000 px high and centred on the page background colour; it was captured at 1x pixel density, so it is a little soft. The burned captions are drawn over the footage.

**Synthetic Ruler scene.** No photograph is used. The floor is a picture drawn for this video: a plane of wood planks seen in perspective, a reference board of 1.20 x 0.90 m, and a taped outline of 2.40 x 1.60 m (3.84 m2). The sizes are exact by construction, and the scene says so inside the picture ("SYNTHETIC SCENE, TRUE SIZES KNOWN"). It was loaded through the Upload button. The taps on the picture are placed by the script at the corner positions computed from the scene's own geometry, so they are more exact than a person's. With that, SPECTRA measured 3.8 plus or minus 0.3 m2 (3,840,002 mm2 against a truth of 3,840,000, and a bar of 346,583 mm2, 9.03 percent), and a perimeter of 8.0 plus or minus 0.3 m. The bar covers tap placement only, as the app says. The one reference of 1.20 x 0.90 m is large on purpose: a Letter sheet would give a much wider bar for a room.

**Capture aid.** A mint pointer and a click ring were added so that controls do not change without a visible cause. They are a small element injected into the page for the recording only: it follows the automated mouse events and draws a ring on mouse down. It is not part of the app and was not in any shipped file. The pointer follows the real mouse events that drove the page.

**Narration.** [Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M), stock American English `af_heart` voice, speed `0.96`, generated locally with `kokoro-onnx` 0.4.7 from the full-precision `kokoro-v1.0.onnx` and `voices-v1.0.bin` named in the version 2 section. The voice is synthetic and is not a clone of Tarang or any project participant. The script is 186 words in 20 sentences. As in version 2, each sentence was synthesised on its own and placed on the timeline at a chosen time; the start of every sentence was checked against the audio of the finished file with FFmpeg's `silencedetect`. Numbers are spoken as words (the captions show digits).

**Music.** There is an original ambient pad, generated for this video with a short Python and NumPy script and no samples, loops or third-party audio. It is eight slow chords (D minor colour), each voice three detuned sine layers with two to four overtones, a quiet low drone, a slow swell, a low-pass filter near 2.4 kHz and a synthetic-noise reverb of 4 seconds, with a 3 second fade in and a 4 second fade out. There are no drums or rhythm. In the mix it sits at -38 LUFS (about 22 dB under the narration) and a sidechain compressor lowers it by about 10 dB more while a sentence is spoken (measured during speech: narration -16.1 LUFS, music -48.8 LUFS, a margin of 32.7 dB). A copy of the video without the music bed was exported for sharing.

**Audio.** FFmpeg `ebur128` on the finished file: integrated -16.1 LUFS, loudness range 5.8 LU, true peak -4.2 dBFS (no-music version: -16.2 LUFS, -4.1 dBFS).

**Encoding.** Each take was encoded as soon as it was recorded and its frames deleted. The takes were trimmed and joined, then encoded with `libx264` (`-preset slow`, `-crf 20`, `yuv420p`, `+faststart`) for the repository file; the shared versions use `-crf 19`.

The model is Apache-2.0 and the inference library is MIT; their rights remain with their authors. They, FFmpeg and Playwright were used only to produce the video and are not shipped with the browser application. The video retains the same original-work rights reservation and third-party exclusions as the project.

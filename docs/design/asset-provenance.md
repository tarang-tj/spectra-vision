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

The video demo was recorded on version 1.1 and has not been updated for version 2: it shows Objects, Body and Hands only. The v1.1 video demo captures the actual Chromium-rendered app with real model inference, then adds original title cards, captions and a locally synthesized voiceover. It uses no third-party music or footage. Video assets retain the same original-work rights reservation and third-party exclusions as the project.

## Demo narration

`public/demo/spectra-demo-v1.1.1.mp4` replaces the macOS Samantha narration with locally generated neural speech from [Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M), using its stock American English `af_heart` voice at speed `0.96`. The voice is synthetic and is not a clone of Tarang or any project participant. The original script, app footage and 49-second scene structure are retained.

Generation used `kokoro-onnx` 0.6.1 and the full-precision model from [the upstream model-files-v1.1 release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1). Phoneme timestamps from the model supply the sentence caption boundaries. FFmpeg normalizes the narration to a target of -16 LUFS with a -1.5 dBTP ceiling, resamples it to 48 kHz stereo and encodes AAC audio. The H.264 video stream is copied without re-encoding. There is no background music.

The model is Apache-2.0 and the inference library is MIT; their rights remain with their respective authors. Model weights and inference tooling are used only during narration production and are not shipped with or required by the browser application. The prior system-voice video remains available in the [v1.1.0 release](https://github.com/tarang-tj/spectra-vision/releases/tag/v1.1.0).

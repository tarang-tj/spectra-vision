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

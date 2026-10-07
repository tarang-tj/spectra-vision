# SPECTRA interface specification

Concept: [desktop](concept-desktop.png), generated using the built-in Image Gen tool on 2026-10-07. SPECTRA is a camera-first application, not a landing page.

## Composition and tokens

At 1536 × 1024: 32px outer gutters, 60px navigation band, 130px heading/actions band, 75:25 viewport and inspector split with 12px gap. Camera canvas has a 16:10 aspect ratio. Below it, a narrow metric/export strip, then a fine-rule footer. No nested cards or decorative backgrounds.

Background #090e11 (near-black, cool), surface #10191c, primary white #f3f7f6, muted #b1bec3, accent mint #a4ffd9, border #31544d. Secondary tracked-object colors blue #67aaff and lavender #ae94fa. Natural photo has no color overlay. Only readable local HUD labels and toolbar scrims overlay it. 6px viewport/control corner radii, 1px borders, crisp 1.75px outlined icons, controlled glow reserved for model-driven geometry.

Typography: locally bundled Inter variable; system sans fallback. Heading 66px/1.06, 700, -0.045em; subtitle 24px/1.3, 500. Brand 15px, 600, 0.35em. Controls 14px/1.4, 500; inspector heading 20px, 600; detail/body 14px, status labels 11px with 0.08em tracking. At mobile: heading 38px, single-column camera then inspector, navigation modes occupy a dedicated second row; controls remain at least 40px tall. Motion respects reduced-motion preference.

## Copy allowlist

SPECTRA; Objects; Body; Hands; Processed on your device; Reality, augmented.; Your camera. A new way to see.; Start camera; Upload; DEMO IMAGE; OBJECT DETECTION; In the frame; Motion map; Confidence; 45%; Trails; Switch to Hands. Pinch to paint.; Demo studio; Mirror; Screenshot; Fullscreen; Inference; Frame rate; Tracked; Export session; No account. No uploads.

Dynamic detected names, track IDs, scores, timing, FPS, counts, camera names, filenames, loading/error text and states are necessarily runtime values. The concept's illustrated object names and scores are never hardcoded inference results.

## Assets and icon inventory

Desktop concept is reference only and never used as the app UI. Production studio image is separately generated from its photograph; a separate anatomically correct close-up hands image makes hand mode useful without camera permission. Demo inputs are explicitly identified as still images. Aperture mark is a simple code-native geometric navigation icon; camera, upload, GitHub, shield, pause/play, mirror, camera screenshot, fullscreen, export and help use consistent outlined Lucide icons. Controls have accessible names, visible focus, and selected/disabled states.

## Architecture and real workflow

App composes Header, CameraStage, Inspector and Footer, backed by a source controller and worker inference hook. Dedicated worker owns MediaPipe tasks; one transferred ImageBitmap is in flight at a time. Rendering runs separately. Original IoU/centroid tracker adds temporal identities and trails to detector outputs. Body renders actual pose landmarks. Hands renders actual hand landmarks and pinch-distance light painting with hysteresis. Metrics are measured. Source changes invalidate stale results and release tracks/object URLs. Main controls: camera permission, camera selection, local image/video upload, pause, mode change, confidence, trails, mirror, screenshot, fullscreen, JSON export, demo reset and concise privacy/help.

## Necessary deviations from concept

Actual model results replace illustrative detections and dummy metrics. Body/Hands have mode-specific inspector labels. Demo selector, stop-camera state, clear paint, camera selector and local source reset are required to make all flows usable. Help explains model limitations and camera recovery. These controls reuse existing toolbar/rail styles; no new major panel families. No animated fake scene motion is introduced in a still-image demo.

## v1.1 functional extensions

Constellation adds an optional dark canvas scrim and static image-plane grid; glow remains tied to inferred geometry. A second inspector switch and motion-demo button extend the existing control rail. Record adds one outlined toolbar action plus a compact recording timer. Labeled animated demo clips pan the existing generated still photos; the still demo remains unchanged by default. These are intentional functional additions, preserving the original composition, tokens, heading, source actions and icon family. No preset supplies model results.

Extended copy: Constellation; Try motion demo; Use still demo; ANIMATED DEMO; Animated demo · still-photo pan; Record; Stop; Watch demo. Recording timer is a measured runtime value. Video watch-page copy and chapter cards belong to the demo deliverable, not the app concept.

# Third-party notices

SPECTRA's original orchestration, UI, tracker and rendering code is owned by Tarang Jammalamadaka under the repository's [all-rights-reserved notice](LICENSE). No ownership is claimed over the third-party material below. No third-party model or library is relicensed by that notice.

## Runtime and models

MediaPipe Tasks Vision **1.1.0**, its JavaScript runtime and WebAssembly files are provided by Google / The MediaPipe Authors under **Apache-2.0**. [Upstream repository and license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE). The installed runtime is copied without source changes during setup.

| Model                           | Publisher / attribution                                                               | Upstream license reference                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EfficientDet-Lite0, float16 v1  | Google / TensorFlow Authors; EfficientDet implementation by the Google AutoML authors | [TensorFlow EfficientDet model listing](https://www.kaggle.com/models/tensorflow/efficientdet/tfLite/lite0-detection-metadata/1), [AutoML Apache-2.0 license](https://github.com/google/automl/blob/master/LICENSE), [official MediaPipe model documentation](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector) |
| BlazePose GHUM Lite, float16 v1 | Google; Valentin Bazarevsky, Ivan Grishchenko and Eduard Gabriel Bazavan              | [Official model card, Apache-2.0](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)                                                                                                                                                                                                                  |
| Hand Landmarker, float16 v1     | Google / MediaPipe Authors                                                            | [Official hand tracking model card, Apache-2.0](<https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf>)                                                                                                                                                           |

Three models were added in version 2. Each was downloaded from the URL below and hashed on 2026-10-07; `pnpm run setup` refuses a file whose SHA-256 differs.

| Model file                         | Used by      | Source URL                                                                                                                           | SHA-256                                                            | License                    |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------- |
| `face_landmarker.task`             | Face, Fusion | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task                       | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` | Apache-2.0                 |
| `selfie_multiclass_256x256.tflite` | Segment      | https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite | `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0` | Apache-2.0                 |
| `gesture_recognizer.task`          | Gestures     | https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task              | `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482` | Not stated; see note below |

- **Face Landmarker** (Google / MediaPipe Authors). Apache-2.0 is stated in the [Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf) and in the Blendshape V2 and BlazeFace (Short Range) model cards linked from the [official Face Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).
- **Multiclass selfie segmenter** (Google / MediaPipe Authors). Apache-2.0 is stated in the [Multiclass Segmentation model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf).
- **Gesture Recognizer** (Google / MediaPipe Authors). **The [gesture classification model card](https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf) states no license.** The file is a bundle of a hand landmarker and a gesture embedder and classifier. What is stated: the Hand Tracking model card gives Apache-2.0 for the hand landmarker, and the MediaPipe project that publishes the file is Apache-2.0. SPECTRA attributes the bundle under Apache-2.0 on those two grounds only. For the gesture embedder and classifier inside it, that is an inference from the publisher's project license, not a license their own model card states.

Model download URLs, file sizes and SHA-256 digests are pinned in [scripts/models.json](scripts/models.json). The models are downloaded from official Google storage, hash-verified and served without weight modifications. The Apache license text is included in [public/licenses/Apache-2.0.txt](public/licenses/Apache-2.0.txt) and deployed at `licenses/Apache-2.0.txt`. The metadata-bearing TensorFlow listing documents the EfficientDet-Lite model family; the exact MediaPipe float16 artifact is identified separately by its URL and digest in the manifest.

The COCO training dataset and its original photographs are not included in this repository. Demo photos were generated specifically for SPECTRA.

## UI and development dependencies

| Dependency                                          | License / attribution                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| React / React DOM                                   | MIT; Meta Platforms, Inc. and affiliates / React contributors                   |
| Lucide React icons                                  | ISC; Lucide contributors, with inherited Feather icon notices retained upstream |
| Inter variable font, distributed through Fontsource | SIL Open Font License 1.1; The Inter Project Authors / Rasmus Andersson         |
| TypeScript                                          | Apache-2.0; Microsoft Corporation                                               |
| Vite / React Vite plugin / Vitest                   | MIT; their respective contributors                                              |
| Playwright                                          | Apache-2.0; Microsoft Corporation                                               |

The lockfile is the exact dependency inventory. Setup collects the actual installed packages' LICENSE, COPYING and NOTICE files into `public/licenses/dependencies.txt`. That generated file is included in the deployed site and build archive, including transitive dependency notices. Original upstream headers and bundled notices are retained.

Generated images, their tool mode and prompts are described in [asset provenance](docs/design/asset-provenance.md). Generated material is not presented as a photograph of an identified real person or as a manually captured app screenshot.

## Demo narration production

The v1.1.1 video narration is generated locally using [Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M), provided by hexgrad under Apache-2.0, and [kokoro-onnx 0.6.1](https://github.com/thewh1teagle/kokoro-onnx), provided by its contributors under MIT. The version 2.0 video narration uses the same model and voice with kokoro-onnx 0.4.7. Both use the stock `af_heart` synthetic voice. The model weights and production tools are not distributed with the browser app. SPECTRA's rights reservation does not claim ownership of these tools, weights or voice styles. See [narration provenance](docs/design/asset-provenance.md#demo-narration).

# Third-party notices

SPECTRA's original orchestration, UI, tracker and rendering code is owned by Tarang Jammalamadaka under the repository's [all-rights-reserved notice](LICENSE). No ownership is claimed over the third-party material below. No third-party model or library is relicensed by that notice.

## Runtime and models

MediaPipe Tasks Vision **1.1.0**, its JavaScript runtime and WebAssembly files are provided by Google / The MediaPipe Authors under **Apache-2.0**. [Upstream repository and license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE). The installed runtime is copied without source changes during setup.

| Model                           | Publisher / attribution                                                               | Upstream license reference                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EfficientDet-Lite0, float16 v1  | Google / TensorFlow Authors; EfficientDet implementation by the Google AutoML authors | [TensorFlow EfficientDet model listing](https://www.kaggle.com/models/tensorflow/efficientdet/tfLite/lite0-detection-metadata/1), [AutoML Apache-2.0 license](https://github.com/google/automl/blob/master/LICENSE), [official MediaPipe model documentation](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector) |
| BlazePose GHUM Lite, float16 v1 | Google; Valentin Bazarevsky, Ivan Grishchenko and Eduard Gabriel Bazavan              | [Official model card, Apache-2.0](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)                                                                                                                                                                                                                  |
| Hand Landmarker, float16 v1     | Google / MediaPipe Authors                                                            | [Official hand tracking model card, Apache-2.0](<https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf>)                                                                                                                                                           |

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

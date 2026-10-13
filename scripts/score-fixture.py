# Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
"""One-off: makes tests/fixtures/score/pycocotools-case.json. Not run by the gate.

A seeded, made-up case (20 pictures of labels, and boxes made from them by
shifting, dropping, doubling, renaming and adding boxes, with tied scores and
two crowd regions) is scored by COCO's own scorer, pycocotools. The case and
pycocotools' answers are stored together; tests/score-pycocotools.test.ts
scores the same case with SPECTRA's code and must get the same numbers.

Run it in a scratch environment outside the repository:
    python -m venv <dir> && <dir>/bin/pip install pycocotools
    <dir>/bin/python scripts/score-fixture.py
"""
import contextlib
import io
import json
import random
from importlib.metadata import version
from pathlib import Path

import numpy
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

SEED = 20261012
WIDTH, HEIGHT = 640, 480
LABELLED = ["book", "bowl", "chair", "cup", "spoon"]  # spoon never gets a box
DRAWN = ["book", "bowl", "chair", "cup", "clock", "vase"]  # no clock is labelled
rng = random.Random(SEED)


def two(value):
    return round(value, 2)


def place(w, h):
    return [two(rng.uniform(0, WIDTH - w)), two(rng.uniform(0, HEIGHT - h)), w, h]


def shifted(box, spread):
    x, y, w, h = box
    return [
        two(x + rng.gauss(0, spread) * w),
        two(y + rng.gauss(0, spread) * h),
        two(w * (1 + rng.gauss(0, spread))),
        two(h * (1 + rng.gauss(0, spread))),
    ]


pictures = []
for index in range(20):
    labels, boxes = [], []
    for _ in range(rng.randint(2, 7)):
        w, h = two(rng.uniform(30, 200)), two(rng.uniform(30, 200))
        labels.append({"label": rng.choice(LABELLED), "box": place(w, h), "crowd": False})
    if index in (3, 11):
        region = [two(rng.uniform(0, 200)), two(rng.uniform(0, 100)), 300.0, 250.0]
        labels.append({"label": "book", "box": region, "crowd": True})
        for _ in range(3):  # boxes inside the crowd region
            x, y = region[0] + rng.uniform(0, 240), region[1] + rng.uniform(0, 190)
            boxes.append({"label": "book", "score": two(rng.uniform(0.1, 0.9)), "box": [two(x), two(y), 50.0, 50.0]})
    for label in labels:
        if label["crowd"] or label["label"] == "spoon" or rng.random() < 0.2:
            continue  # dropped: a miss
        name = label["label"]
        if rng.random() < 0.15:  # renamed: a false box under another name
            name = rng.choice([n for n in DRAWN if n != name])
        score = two(rng.uniform(0.05, 0.99))
        boxes.append({"label": name, "score": score, "box": shifted(label["box"], 0.07)})
        if rng.random() < 0.25:  # a second box on the same object
            tied = score if rng.random() < 0.4 else two(score * rng.uniform(0.5, 1))
            boxes.append({"label": name, "score": tied, "box": shifted(label["box"], 0.1)})
    for _ in range(rng.randint(0, 3)):  # boxes on nothing, some with a tied score
        w, h = two(rng.uniform(30, 150)), two(rng.uniform(30, 150))
        score = rng.choice([0.5, 0.25, two(rng.uniform(0.05, 0.8))])
        boxes.append({"label": rng.choice(DRAWN), "score": score, "box": place(w, h)})
    rng.shuffle(boxes)
    pictures.append({"id": 100 + index * 7, "width": WIDTH, "height": HEIGHT, "labels": labels, "boxes": boxes})

names = sorted(set(LABELLED) | set(DRAWN))
ids = {name: i + 1 for i, name in enumerate(names)}
truth = {
    "images": [{"id": p["id"], "width": WIDTH, "height": HEIGHT} for p in pictures],
    "categories": [{"id": ids[name], "name": name} for name in names],
    "annotations": [],
}
results = []
for p in pictures:
    for label in p["labels"]:
        truth["annotations"].append({
            "id": len(truth["annotations"]) + 1,
            "image_id": p["id"],
            "category_id": ids[label["label"]],
            "bbox": label["box"],
            "area": label["box"][2] * label["box"][3],
            "iscrowd": int(label["crowd"]),
        })
    for box in p["boxes"]:
        results.append({"image_id": p["id"], "category_id": ids[box["label"]], "bbox": box["box"], "score": box["score"]})

with contextlib.redirect_stdout(io.StringIO()):
    coco = COCO()
    coco.dataset = truth
    coco.createIndex()
    scorer = COCOeval(coco, coco.loadRes(results), "bbox")
    scorer.evaluate()
    scorer.accumulate()
    scorer.summarize()

# precision is [threshold, recall, class, area range, max boxes]; -1 marks a
# class with no label. Area range 0 is "all", max boxes index 2 is 100.
at50 = scorer.eval["precision"][0, :, :, 0, 2]
per_class = {
    name: float(numpy.mean(at50[:, k]))
    for k, name in enumerate(names)
    if (at50[:, k] > -1).any()
}
case = {
    "note": "Made by scripts/score-fixture.py. Do not edit by hand: the expected numbers are pycocotools' own.",
    "pycocotools": version("pycocotools"),
    "numpy": numpy.__version__,
    "seed": SEED,
    "expected": {
        "ap5095": float(scorer.stats[0]),
        "ap50": float(scorer.stats[1]),
        "perClassAp50": per_class,
    },
    "pictures": pictures,
}
out = Path(__file__).resolve().parent.parent / "tests/fixtures/score/pycocotools-case.json"
out.write_text(json.dumps(case, indent=1) + "\n")
print(f"{out}: {len(pictures)} pictures, {len(truth['annotations'])} labels, {len(results)} boxes")
print(case["expected"])

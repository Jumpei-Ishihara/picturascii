#!/usr/bin/env python3
"""JS単体テスト（test/unit.mjs）用の期待値をデスクトップ版から生成する。"""

import argparse
import json
import random
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--desktop-repo', required=True, type=Path)
    args = ap.parse_args()
    sys.path.insert(0, str(args.desktop_repo.resolve()))
    import visualizer  # noqa: E402

    rng = np.random.default_rng(7)
    seeds = [0, 1, 53, 317, 7919, 123456789, 2**40 + 12345] + \
        [int(v) for v in rng.integers(0, 2**52, 20)]
    h1, h2 = visualizer._vec_hash2(np.array(seeds, dtype=np.uint64))

    py_seeds = [0, 6271, 6271 * 7, 6271 * 1000003, 2**33 + 5]
    colors = [[int(v) for v in rng.integers(0, 256, 3)] for _ in range(200)] + \
        [[0, 0, 0], [255, 255, 255], [80, 255, 10], [0, 0, 255], [255, 0, 0], [10, 10, 9]]
    hsv = cv2.cvtColor(np.array([colors], dtype=np.uint8), cv2.COLOR_BGR2HSV)[0].tolist()
    shifts = [[c, s, list(visualizer._shift_hue(tuple(c), s))]
              for c in ([80, 255, 10], [30, 60, 200], [200, 200, 200]) for s in (0, 5, 120, 215, 355)]

    out = {
        'hash2': [[s, float(a), float(b)] for s, a, b in zip(seeds, h1, h2)],
        'pyRandom': [[s, random.Random(s).random()] for s in py_seeds],
        'bgr2hsv': [[c, v] for c, v in zip(colors, hsv)],
        'shiftHue': shifts,
    }
    (ROOT / 'test' / 'unit_expected.json').write_text(json.dumps(out), encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()

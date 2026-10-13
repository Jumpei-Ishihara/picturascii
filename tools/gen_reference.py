#!/usr/bin/env python3
"""test/cases.json の各ケースをデスクトップ版 process_frame() で描画し、参照PNGを書き出す。

Usage:
    python tools/gen_reference.py --desktop-repo ../動画変換スクリプト
"""

import argparse
import json
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--desktop-repo', required=True, type=Path)
    args = ap.parse_args()

    sys.path.insert(0, str(args.desktop_repo.resolve()))
    import visualizer  # noqa: E402

    cases = json.loads((ROOT / 'test' / 'cases.json').read_text(encoding='utf-8'))
    out_dir = ROOT / 'test' / 'reference'
    out_dir.mkdir(parents=True, exist_ok=True)
    for case in cases:
        frame = cv2.imread(str(ROOT / 'test' / 'fixtures' / case['image']))
        cfg = {**visualizer.DEFAULT_CONFIG, **case['cfg']}
        mp_instance = None
        if cfg['detect_mode'] == 'm2':
            # デスクトップ版と同じ横長モデル（model_selection=1）
            import mediapipe as mp
            mp_instance = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
            mask, _ = visualizer.detect_silhouette(frame, cfg, mp_instance=mp_instance)
            cv2.imwrite(str(out_dir / f"{case['id']}_mask.png"), mask)
        out = visualizer.process_frame(frame, int(case['frame']), cfg, mp_instance=mp_instance)
        if mp_instance is not None:
            mp_instance.close()
        cv2.imwrite(str(out_dir / f"{case['id']}.png"), out)
        print(case['id'], out.shape)


if __name__ == '__main__':
    main()

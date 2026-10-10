#!/usr/bin/env python3
"""Hershey Duplex のグリフタイルを1枚のアトラスPNGとJSONに書き出す。

デスクトップ版 visualizer.py の _get_glyph_tile() をそのまま呼び出すため、
Web版の文字形状はデスクトップ版と一致する。

Usage:
    python tools/gen_atlas.py --desktop-repo ../動画変換スクリプト
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

CHARS = ''.join(chr(c) for c in range(33, 127))  # 印字可能ASCII（スペース除外）
SCALE_STEPS = 81                                 # fscale 0.00〜4.00（0.05刻み）


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--desktop-repo', required=True, type=Path)
    ap.add_argument('--out-dir', type=Path,
                    default=Path(__file__).resolve().parent.parent / 'assets')
    args = ap.parse_args()

    sys.path.insert(0, str(args.desktop_repo.resolve()))
    import visualizer  # noqa: E402

    tiles = []
    for ch in CHARS:
        for q in range(SCALE_STEPS):
            tile, gox, goy = visualizer._get_glyph_tile(ch, q / 20, 1)
            if tile.size == 0 or int(tile.max()) == 0:
                tile = np.zeros((0, 0), dtype=np.uint8)
            tiles.append((ch, q, tile, gox, goy))

    # 文字ごとに1枚のPNG（スケール順に縦積み）へ分割し、使う文字だけ読み込めるようにする
    out_dir = args.out_dir / 'glyphs'
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.png'):
        old.unlink()
    glyphs = {}
    total = 0
    for ch in CHARS:
        entries = [t for t in tiles if t[0] == ch]
        width = max(1, max(t[2].shape[1] for t in entries))
        height = max(1, sum(t[2].shape[0] for t in entries))
        sheet = np.zeros((height, width), dtype=np.uint8)
        y = 0
        rects = []
        for _, _, tile, gox, goy in entries:
            th, tw = tile.shape
            if th:
                sheet[y:y + th, :tw] = tile
            rects.append([0, y, tw, th, int(gox), int(goy)])
            y += th
        name = f'{ord(ch):03d}.png'
        cv2.imwrite(str(out_dir / name), sheet, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        total += (out_dir / name).stat().st_size
        glyphs[ch] = {'file': name, 'w': width, 'h': height, 'rects': rects}

    meta = {
        'font': 'cv2.FONT_HERSHEY_DUPLEX',
        'thickness': 1,
        'scaleStep': 0.05,
        'scaleSteps': SCALE_STEPS,
        'glyphs': glyphs,  # char -> {file, w, h, rects: [[x, y, w, h, gox, goy] × scaleSteps]}
    }
    (args.out_dir / 'glyphs.json').write_text(
        json.dumps(meta, separators=(',', ':')), encoding='utf-8')
    print(f'{len(CHARS)} sheets, {total / 1024:.0f} KiB total')


if __name__ == '__main__':
    main()

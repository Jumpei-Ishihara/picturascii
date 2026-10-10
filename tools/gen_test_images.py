#!/usr/bin/env python3
"""比較テスト用の合成画像を決定論的に生成する（著作物を含まない）。"""

from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / 'test' / 'fixtures'


def _figure_mask(h: int, w: int) -> np.ndarray:
    """頭・胴・腕からなる人型シルエット"""
    m = np.zeros((h, w), dtype=np.uint8)
    cx = w // 2
    cv2.circle(m, (cx, int(h * 0.25)), int(h * 0.11), 255, -1)
    cv2.ellipse(m, (cx, int(h * 0.62)), (int(w * 0.13), int(h * 0.27)), 0, 0, 360, 255, -1)
    cv2.line(m, (cx - int(w * 0.11), int(h * 0.45)), (cx - int(w * 0.26), int(h * 0.75)), 255, int(h * 0.06))
    cv2.line(m, (cx + int(w * 0.11), int(h * 0.45)), (cx + int(w * 0.24), int(h * 0.30)), 255, int(h * 0.06))
    cv2.rectangle(m, (cx - int(w * 0.09), int(h * 0.80)), (cx + int(w * 0.09), h), 255, -1)
    return m


def _shaded(h: int, w: int, rng: np.random.Generator) -> np.ndarray:
    """斜めグラデーション + 縞 + ノイズの被写体テクスチャ（BGR）"""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = (xx / w * 0.6 + (1 - yy / h) * 0.4)
    stripes = 0.15 * np.sin(xx * 0.05 + yy * 0.03)
    base = np.clip(g + stripes, 0, 1)
    img = np.stack([base * 120 + 40, base * 170 + 60, base * 235 + 20], axis=2)
    img += rng.normal(0, 6, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8)


def dark_figure(rng) -> np.ndarray:
    h, w = 540, 960
    bg = np.clip(rng.normal(8, 3, (h, w, 3)), 0, 255).astype(np.uint8)
    fig = _shaded(h, w, rng)
    m = _figure_mask(h, w)[:, :, None] > 0
    return np.where(m, fig, bg)


def green_screen(rng) -> np.ndarray:
    h, w = 601, 801  # 奇数サイズで端の扱いも検証する
    bg = np.empty((h, w, 3), dtype=np.float32)
    bg[:] = (60, 200, 40)
    bg += rng.normal(0, 5, bg.shape)
    fig = _shaded(h, w, rng).astype(np.float32)
    fig[:, :, 0] = fig[:, :, 0] * 0.4 + 120  # 青寄りの衣装
    m = _figure_mask(h, w)[:, :, None] > 0
    return np.clip(np.where(m, fig, bg), 0, 255).astype(np.uint8)


def color_field(rng) -> np.ndarray:
    h, w = 540, 960
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.stack([
        127 + 127 * np.sin(xx * 0.011),
        127 + 127 * np.sin(yy * 0.017 + 1.0),
        127 + 127 * np.sin((xx + yy) * 0.007 + 2.0),
    ], axis=2)
    for _ in range(14):
        c = (int(rng.integers(0, w)), int(rng.integers(0, h)))
        col = tuple(int(v) for v in rng.integers(0, 256, 3))
        cv2.circle(img, c, int(rng.integers(20, 90)), col, -1)
    img += rng.normal(0, 4, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (dark_figure, green_screen, color_field):
        img = fn(np.random.default_rng(20261010))
        cv2.imwrite(str(OUT / f'{fn.__name__}.png'), img)
        print(fn.__name__, img.shape)


if __name__ == '__main__':
    main()

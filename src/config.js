// 設定値。キー名・既定値はデスクトップ版 visualizer.py の DEFAULT_CONFIG と同じ。
// 色は BGR 配列（デスクトップ版と同じ並び）。

import { pyRandomFirst } from './random.js';

export const CHAR_SETS = {
  digits: [...'0123456789'],
  hex: [...'0123456789ABCDEF'],
  binary: [...'01'],
  ascii: [...'.,:-=+*#%@'], // 輝度順（スパース→デンス）
  symbols: [...'!#$%&*+=?@~'],
};

export const DEFAULT_CONFIG = Object.freeze({
  cell_size: 30,
  threshold: 12,
  grid_color: [80, 255, 10],
  grid_intensity: 1.5,
  anim_speed: 1.0,
  digit_period: 80,
  glow_tight: 0.7,
  glow_mid: 0.7,
  glow_bloom: 0.7,
  pulse_amp: 0.1,
  size_anim: false,
  size_period: 200,
  size_hold: 0.65,
  size_min: 0.3,
  size_max: 0.5,
  font_scale_factor: 1.0,
  digit_scale_min: 0.3,
  digit_scale_max: 0.7,
  detect_mode: 'm0',
  bg_color_hsv: null,
  hue_tolerance: 22,
  sat_min: 30,
  char_set: 'digits',
  char_mode: 'density',
  custom_chars: '',
  brightness_gamma: 1.5,
  hue_shift: 0,
  color_range: 1.5,
  color_source: 'hue',
  mirror: false,
  grid_opacity: 1.0,
  saturation: 1.0,
  effect_brightness: 1.0,
  canvas_bg: [0, 0, 0],
  composite_alpha: 1.0,
  composite_mode: 'normal',
  mask_invert: false,
});

/** 文字セットを解決する（custom は空白除外・重複削除・順序保持、空なら digits） */
export function resolveChars(cfg) {
  if (cfg.char_set === 'custom') {
    const seen = new Set();
    const list = [];
    for (const c of cfg.custom_chars || '') {
      if (c.trim() && !seen.has(c)) { seen.add(c); list.push(c); }
    }
    return list.length ? list : CHAR_SETS.digits;
  }
  return CHAR_SETS[cfg.char_set] || CHAR_SETS.digits;
}

/** visualizer._font_scale */
export const fontScale = (cellSize) => Math.max(0.15, Math.min(0.95, cellSize * 0.024));

/** visualizer.get_dynamic_cell_size */
export function dynamicCellSize(frameIdx, cfg) {
  const base = cfg.cell_size;
  if (!cfg.size_anim) {
    const sMax = Math.max(0.01, cfg.size_max);
    return Math.max(2, Math.trunc(base * sMax));
  }
  const sMin = Math.max(0.01, cfg.size_min);
  const sMax = Math.max(sMin, cfg.size_max);
  const holdRatio = Math.max(0, Math.min(0.99, cfg.size_hold));
  const period = Math.max(20, Math.trunc(cfg.size_period / cfg.anim_speed));
  const generation = Math.floor(frameIdx / period);
  const phase = (frameIdx % period) / period;
  let t = 0;
  if (phase >= holdRatio) {
    const raw = (phase - holdRatio) / (1 - holdRatio);
    t = raw * raw * (3 - 2 * raw);
  }
  const cur = base * (sMin + (sMax - sMin) * pyRandomFirst(generation * 6271));
  const next = base * (sMin + (sMax - sMin) * pyRandomFirst((generation + 1) * 6271));
  return Math.max(2, Math.trunc(cur * (1 - t) + next * t));
}

// 見た目のプリセット。検出設定（モード・閾値など）は変えない。
// 色は BGR、hue_shift は 0=緑 / 60=シアン / 120=青 / 180=マゼンタ / 240=黄 / 300=赤。

export const DETECT_KEYS = ['detect_mode', 'threshold', 'mp_confidence', 'mp_smooth_edge', 'mp_detail_mode', 'hue_tolerance', 'sat_min', 'bg_color_hsv', 'mask_invert'];

export const PRESETS = [
  { id: 'matrix', label: 'MATRIX', cfg: {} },
  {
    id: 'ghost', label: 'ASCII GHOST',
    cfg: { char_set: 'ascii', hue_shift: 60, glow_bloom: 1.2, color_range: 1.0, cell_size: 24, size_max: 0.7 },
  },
  {
    id: 'binary', label: 'BINARY BLUE',
    cfg: { char_set: 'binary', char_mode: 'random', hue_shift: 120, glow_tight: 1.0, glow_mid: 0.9 },
  },
  {
    id: 'material', label: 'MATERIAL',
    cfg: { char_set: 'ascii', color_source: 'material', glow_tight: 0.4, glow_mid: 0.4, glow_bloom: 0.3, cell_size: 22, size_max: 0.6 },
  },
  {
    id: 'paper', label: 'PAPER',
    cfg: {
      char_set: 'ascii', canvas_bg: [235, 240, 242], effect_brightness: 0,
      glow_tight: 0, glow_mid: 0, glow_bloom: 0, pulse_amp: 0, grid_intensity: 2.2, cell_size: 22, size_max: 0.6,
    },
  },
  {
    id: 'hologram', label: 'HOLOGRAM',
    cfg: { char_set: 'hex', hue_shift: 60, composite_mode: 'add', composite_alpha: 0.85, glow_bloom: 1.0 },
  },
  {
    id: 'thermal', label: 'THERMAL',
    cfg: { char_set: 'symbols', hue_shift: 300, color_range: 2.0, brightness_gamma: 1.0, glow_mid: 1.0 },
  },
];

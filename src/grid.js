// 文字グリッドレイヤーの生成。visualizer.draw_silhouette_grid のうちグロー合成より前の部分。
// 出力は RGBA（A=255）の Uint8Array。グローと最終合成は gl.js が行う。

import { dynamicCellSize, fontScale, resolveChars } from './config.js';
import { shiftHue, roundHalfEven } from './color.js';
import { grayOf } from './detect.js';
import { hash2 } from './random.js';

const f32 = Math.fround;

/** visualizer._cell_dominant_color（BGR を返す） */
function cellDominantColor(rgba, w, h, cy, cx, cellSize, counts) {
  const r = cellSize >> 1;
  const y0 = Math.max(0, cy - r), y1 = Math.min(h, cy + r + 1);
  const x0 = Math.max(0, cx - r), x1 = Math.min(w, cx + r + 1);
  if (y1 <= y0 || x1 <= x0) return [80, 255, 10];
  counts.fill(0);
  let best = 0, bestCnt = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4;
      const key = ((rgba[p + 2] >> 4) << 8) | ((rgba[p + 1] >> 4) << 4) | (rgba[p] >> 4);
      counts[key]++;
    }
  }
  // np.unique は昇順なので、同数なら小さいキーを採用する
  for (let k = 0; k < 4096; k++) if (counts[k] > bestCnt) { bestCnt = counts[k]; best = k; }
  return [((best >> 8) & 15) * 16 + 8, ((best >> 4) & 15) * 16 + 8, (best & 15) * 16 + 8];
}

/**
 * mask は mw×mh（検出を縮小解像度で行った場合は w×h より小さい）。null なら全面。
 * buffers は呼び出し側で保持し、フレーム間で使い回す。
 */
export function buildLayer({ rgba, w, h, mask, mw = w, mh = h, frameIdx, cfg, atlas, buffers = {} }) {
  const cellSize = dynamicCellSize(frameIdx, cfg);
  const intensity = cfg.grid_intensity;
  const speed = cfg.anim_speed;
  const fscale = fontScale(cellSize) * cfg.font_scale_factor;
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);

  const gamma = cfg.brightness_gamma;
  const hueShiftDeg = Math.trunc(cfg.hue_shift);
  const cr = cfg.color_range;
  const saturation = Math.max(0, Math.min(1, cfg.saturation));
  const useMaterial = cfg.color_source === 'material';

  let gc = cfg.grid_color;
  if (hueShiftDeg !== 0 && !useMaterial) gc = shiftHue(gc, hueShiftDeg);

  const pulse = 1 - cfg.pulse_amp + cfg.pulse_amp * Math.sin(frameIdx * 0.07 * speed);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = f32(Math.pow(f32(i / 255), gamma));
  const ip = intensity * pulse;

  const dimCol = [Math.max(0, gc[0] - Math.trunc(55 * cr)), Math.max(0, gc[1] - Math.trunc(170 * cr)), Math.max(0, gc[2] - Math.trunc(5 * cr))];
  const hotCol = [Math.min(255, gc[0] + Math.trunc(30 * cr)), Math.min(255, gc[1]), Math.min(255, gc[2] + Math.trunc(40 * cr))];

  const chars = resolveChars(cfg);
  const nChars = chars.length;
  const period = Math.max(1, Math.trunc(cfg.digit_period / speed));
  const dsMin = cfg.digit_scale_min;
  const dsMax = Math.max(dsMin, cfg.digit_scale_max);
  const density = cfg.char_mode === 'density';

  if (buffers.size !== w * h) {
    buffers.size = w * h;
    buffers.layer = new Uint8Array(w * h * 4);
    buffers.intensity = new Uint8Array(w * h);
  }
  const layer = buffers.layer;
  layer.fill(0);
  // HUE モード: 強度マップ（np.maximum で積み上げ）とセル色グリッド
  const intensityMap = useMaterial ? null : buffers.intensity;
  if (intensityMap) intensityMap.fill(0);
  const colorGrid = useMaterial ? null : new Uint8Array(rows * cols * 3);
  const counts = useMaterial ? new Int32Array(4096) : null;

  for (let r = 0; r < rows; r++) {
    const cy = Math.min(r * cellSize + (cellSize >> 1), h - 1);
    for (let c = 0; c < cols; c++) {
      const cx = Math.min(c * cellSize + (cellSize >> 1), w - 1);
      const pi = cy * w + cx;
      if (mask && !mask[Math.floor((cy * mh) / h) * mw + Math.floor((cx * mw) / w)]) continue;
      const p = pi * 4;
      const brt = lut[grayOf(rgba[p], rgba[p + 1], rgba[p + 2])];
      const alp = f32(Math.min(f32(brt * ip), 1));
      if (alp < f32(0.04)) continue;

      // 文字とスケールの決定（世代ごとに決定論的に変化）
      const distRatio = (c / Math.max(1, cols - 1) + r / Math.max(1, rows - 1)) * 0.5;
      const pos = frameIdx + Math.trunc(distRatio * period * 0.6);
      const gen = Math.floor(pos / period);
      const phase = f32(f32(pos % period) / period);
      const [h1c, h2c] = hash2(gen * 7919 + r * 317 + c * 53);
      const [h1n, h2n] = hash2((gen + 1) * 7919 + r * 317 + c * 53);
      let charIdx, scCur, scNext;
      if (density) {
        charIdx = Math.trunc(f32(brt * (nChars - 1)));
        scCur = dsMin + (dsMax - dsMin) * h1c;
        scNext = dsMin + (dsMax - dsMin) * h1n;
      } else {
        charIdx = Math.trunc(h1c * nChars);
        scCur = dsMin + (dsMax - dsMin) * h2c;
        scNext = dsMin + (dsMax - dsMin) * h2n;
      }
      charIdx = Math.min(nChars - 1, Math.max(0, charIdx));
      const tSm = f32(f32(phase * phase) * f32(3 - 2 * phase));
      const scale = f32(scCur * (1 - tSm) + scNext * tSm);
      const t = atlas.tile(chars[charIdx], fscale * scale);
      if (!t.w) continue;

      if (!useMaterial) {
        // セル色（dim → gc → hot の2区間補間）
        const lo = alp <= 0.5;
        const ts = lo ? f32(alp / 0.5) : f32(f32(alp - 0.5) / 0.5);
        const ci = (r * cols + c) * 3;
        for (let k = 0; k < 3; k++) {
          const c0 = lo ? dimCol[k] : gc[k];
          const c1 = lo ? gc[k] : hotCol[k];
          let v = f32(c0 + f32(f32(c1 - c0) * ts));
          if (saturation < 1) v = f32(f32(v * saturation) + 255 * (1 - saturation));
          colorGrid[ci + k] = Math.min(255, Math.max(0, Math.trunc(v)));
        }
        pasteMax(intensityMap, w, h, t, cx, cy, alp);
      } else {
        const cg = cellDominantColor(rgba, w, h, cy, cx, cellSize, counts);
        const dim = cg.map((v) => Math.max(0, Math.trunc(v * Math.max(0, 1 - 0.7 * cr))));
        const hot = cg.map((v) => Math.min(255, Math.trunc(v * (1 + 0.2 * cr) + 20 * cr)));
        let tc;
        if (alp <= 0.5) tc = lerpColor(alp / 0.5, dim, cg);
        else tc = lerpColor((alp - 0.5) / 0.5, cg, hot);
        if (saturation < 1) {
          const inv = 1 - saturation;
          tc = tc.map((v) => Math.trunc(v * saturation + 255 * inv));
        }
        pasteAdd(layer, w, h, t, cx, cy, alp, tc);
      }
    }
  }

  if (!useMaterial) {
    // color_map（cv2.resize INTER_NEAREST）× 強度 / 255
    const xs = new Int32Array(w);
    for (let x = 0; x < w; x++) xs[x] = Math.min(cols - 1, Math.floor(x * (cols / w)));
    for (let y = 0; y < h; y++) {
      const ry = Math.min(rows - 1, Math.floor(y * (rows / h))) * cols;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = intensityMap[i];
        if (!v) continue;
        const ci = (ry + xs[x]) * 3;
        const o = i * 4;
        // BGR → RGBA
        layer[o] = roundHalfEven(f32(v * colorGrid[ci + 2]) / 255);
        layer[o + 1] = roundHalfEven(f32(v * colorGrid[ci + 1]) / 255);
        layer[o + 2] = roundHalfEven(f32(v * colorGrid[ci]) / 255);
      }
    }
  }
  return layer; // A チャンネルは使わない
}

function lerpColor(t, dim, bright) {
  return [0, 1, 2].map((i) => Math.min(255, Math.trunc(dim[i] + (bright[i] - dim[i]) * t)));
}

/** タイルを alpha 倍（cv2.convertScaleAbs）して np.maximum で積み上げる */
function pasteMax(map, w, h, t, cx, cy, alp) {
  const x0 = cx - t.gox, y0 = cy - t.goy;
  const ys = Math.max(0, -y0), ye = Math.min(t.h, h - y0);
  const xs = Math.max(0, -x0), xe = Math.min(t.w, w - x0);
  for (let y = ys; y < ye; y++) {
    const src = (t.y + y) * t.stride + t.x;
    const dst = (y0 + y) * w + x0;
    for (let x = xs; x < xe; x++) {
      const v = roundHalfEven(t.data[src + x] * alp);
      if (v > map[dst + x]) map[dst + x] = v > 255 ? 255 : v;
    }
  }
}

/** visualizer._paste_glyph: 色付きタイルを飽和加算で貼る（color は BGR） */
function pasteAdd(layer, w, h, t, cx, cy, alp, color) {
  const x0 = cx - t.gox, y0 = cy - t.goy;
  const ys = Math.max(0, -y0), ye = Math.min(t.h, h - y0);
  const xs = Math.max(0, -x0), xe = Math.min(t.w, w - x0);
  for (let y = ys; y < ye; y++) {
    const src = (t.y + y) * t.stride + t.x;
    for (let x = xs; x < xe; x++) {
      const v = Math.min(255, roundHalfEven(t.data[src + x] * alp));
      if (!v) continue;
      const o = ((y0 + y) * w + x0 + x) * 4;
      layer[o] = Math.min(255, layer[o] + Math.trunc(f32(v * color[2]) / 255));
      layer[o + 1] = Math.min(255, layer[o + 1] + Math.trunc(f32(v * color[1]) / 255));
      layer[o + 2] = Math.min(255, layer[o + 2] + Math.trunc(f32(v * color[0]) / 255));
    }
  }
}

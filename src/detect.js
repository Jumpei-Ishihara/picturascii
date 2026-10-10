// 被写体マスク生成（M0 FULL / M1 AUTO / M4 CHROMA）。visualizer.detect_silhouette の移植。
// frame は RGBA の Uint8ClampedArray。マスクは 255=被写体 / 0=背景 の Uint8Array。

import { bgr2hsv, roundHalfEven } from './color.js';

/** cv2.COLOR_BGR2GRAY と同じ固定小数点の輝度 */
export const grayOf = (r, g, b) => (b * 1868 + g * 9617 + r * 4899 + 8192) >> 14;

export function toGray(rgba, w, h) {
  const n = w * h;
  const out = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) out[i] = grayOf(rgba[p], rgba[p + 1], rgba[p + 2]);
  return out;
}

function cornerMargin(w, h) {
  const margin = Math.max(8, Math.floor(Math.min(h, w) / 15));
  return Math.min(margin, Math.floor(h / 4), Math.floor(w / 4));
}

/** 四隅 m×m 領域の画素インデックスを列挙する */
function forEachCorner(w, h, m, fn) {
  const blocks = [[0, 0], [w - m, 0], [0, h - m], [w - m, h - m]];
  for (const [x0, y0] of blocks) {
    for (let y = y0; y < y0 + m; y++) for (let x = x0; x < x0 + m; x++) fn(y * w + x);
  }
}

/** np.median → int（偶数個は中央2値の平均を切り捨て） */
function medianInt(values) {
  const a = Float64Array.from(values).sort();
  const n = a.length;
  const med = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  return Math.trunc(med);
}

function circularHueMean(hues) {
  if (!hues.length) return 0;
  let s = 0, c = 0;
  for (const h of hues) {
    const a = Math.fround(Math.fround(h) * Math.fround((2 * Math.PI) / 180));
    s += Math.fround(Math.sin(a));
    c += Math.fround(Math.cos(a));
  }
  s /= hues.length; c /= hues.length;
  let hue = ((Math.atan2(s, c) * 180) / (2 * Math.PI)) % 180;
  if (hue < 0) hue += 180;
  return roundHalfEven(hue) % 180;
}

function toHsv(rgba, w, h) {
  const n = w * h;
  const H = new Uint8Array(n), S = new Uint8Array(n), V = new Uint8Array(n);
  const t = [0, 0, 0];
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    bgr2hsv(rgba[p + 2], rgba[p + 1], rgba[p], t);
    H[i] = t[0]; S[i] = t[1]; V[i] = t[2];
  }
  return { H, S, V };
}

/** visualizer._mask_chroma_bg（M1 明背景 / M4 共用） */
export function maskChroma(rgba, w, h, cfg) {
  const { H, S, V } = toHsv(rgba, w, h);
  const hueTol = Math.trunc(cfg.hue_tolerance);
  const satMin = Math.trunc(cfg.sat_min);
  let bgHue, bgSat, bgVal;
  if (cfg.bg_color_hsv) {
    [bgHue, bgSat, bgVal] = cfg.bg_color_hsv.map((v) => Math.trunc(v));
  } else {
    const m = cornerMargin(w, h);
    const idx = [];
    forEachCorner(w, h, m, (i) => idx.push(i));
    bgSat = medianInt(idx.map((i) => S[i]));
    bgVal = medianInt(idx.map((i) => V[i]));
    if (bgSat >= 25) {
      const floor = Math.max(25, Math.trunc(bgSat * 0.5));
      let src = idx.filter((i) => S[i] >= floor).map((i) => H[i]);
      if (!src.length) src = idx.map((i) => H[i]);
      bgHue = circularHueMean(src);
    } else {
      bgHue = medianInt(idx.map((i) => H[i]));
    }
  }

  const n = w * h;
  const mask = new Uint8Array(n);
  if (bgSat < 25) {
    // 無彩色背景: 低彩度かつ明度が近い画素を背景とみなす
    for (let i = 0; i < n; i++) {
      const bg = S[i] < 40 && Math.abs(V[i] - bgVal) <= 60;
      mask[i] = bg ? 0 : 255;
    }
    return mask;
  }
  const sLo = Math.max(satMin, bgSat - 80);
  const vLo = Math.max(0, bgVal - 100);
  const hLo = bgHue - hueTol, hHi = bgHue + hueTol;
  for (let i = 0; i < n; i++) {
    if (S[i] < sLo || V[i] < vLo) { mask[i] = 255; continue; }
    const hu = H[i];
    let inRange;
    if (hLo < 0) inRange = hu >= hLo + 180 || hu <= hHi;
    else if (hHi > 179) inRange = hu >= hLo || hu <= hHi - 180;
    else inRange = hu >= hLo && hu <= hHi;
    mask[i] = inRange ? 0 : 255;
  }
  return mask;
}

// ── モルフォロジー ───────────────────────────────────────────────────────────

const kernelCache = new Map();

/** cv2.getStructuringElement(MORPH_ELLIPSE, (k, k)) の各行の [dxFrom, dxTo] */
function ellipseRows(k) {
  if (kernelCache.has(k)) return kernelCache.get(k);
  const r = Math.floor(k / 2), c = Math.floor(k / 2);
  const inv = r ? 1 / (r * r) : 0;
  const rows = [];
  for (let i = 0; i < k; i++) {
    const dy = i - r;
    if (Math.abs(dy) > r) continue;
    const dx = roundHalfEven(c * Math.sqrt((r * r - dy * dy) * inv));
    const j1 = Math.max(c - dx, 0), j2 = Math.min(c + dx + 1, k);
    if (j2 > j1) rows.push([dy, j1 - c, j2 - 1 - c]);
  }
  kernelCache.set(k, rows);
  return rows;
}

/** 行ごとの累積和で膨張/収縮（境界外は無視＝OpenCV の既定境界値と同じ） */
function morph(src, w, h, k, dilate) {
  const rows = ellipseRows(k);
  const pre = new Int32Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w + 1), s = y * w;
    for (let x = 0; x < w; x++) pre[o + x + 1] = pre[o + x] + (src[s + x] ? 1 : 0);
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = !dilate;
      for (const [dy, a, b] of rows) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const x0 = Math.max(0, x + a), x1 = Math.min(w - 1, x + b);
        if (x1 < x0) continue;
        const o = yy * (w + 1);
        const cnt = pre[o + x1 + 1] - pre[o + x0];
        if (dilate) { if (cnt > 0) { hit = true; break; } }
        else if (cnt < x1 - x0 + 1) { hit = false; break; }
      }
      out[y * w + x] = hit ? 255 : 0;
    }
  }
  return out;
}

const openOp = (m, w, h, k) => morph(morph(m, w, h, k, false), w, h, k, true);
const closeOp = (m, w, h, k) => morph(morph(m, w, h, k, true), w, h, k, false);

/**
 * visualizer._postprocess_mask: [OPEN→]CLOSE→微小領域除去→外輪郭の塗りつぶし。
 * 外輪郭の面積は画素数で近似する（cv2.contourArea より境界分だけ大きい）。
 */
export function postprocessMask(mask, w, h, kClose, minAreaRatio, skipOpen = false) {
  let m = skipOpen ? mask : openOp(mask, w, h, 3);
  m = closeOp(m, w, h, kClose);

  // 8連結成分のラベリング
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const areas = [];
  for (let i = 0; i < n; i++) {
    if (!m[i] || label[i] >= 0) continue;
    const id = areas.length;
    let sp = 0, area = 0;
    stack[sp++] = i; label[i] = id;
    while (sp) {
      const p = stack[--sp];
      area++;
      const px = p % w, py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (m[q] && label[q] < 0) { label[q] = id; stack[sp++] = q; }
        }
      }
    }
    areas.push(area);
  }
  const minArea = h * w * minAreaRatio;
  const keep = areas.map((a) => a >= minArea);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && keep[label[i]]) out[i] = 255;

  // 外輪郭の内側（境界から4連結で到達できない背景）を塗りつぶす
  const reach = new Uint8Array(n);
  let sp = 0;
  const seed = (q) => { if (!out[q] && !reach[q]) { reach[q] = 1; stack[sp++] = q; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const p = stack[--sp];
    const px = p % w;
    if (px > 0) seed(p - 1);
    if (px < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < n - w) seed(p + w);
  }
  for (let i = 0; i < n; i++) if (!reach[i]) out[i] = 255;
  return out;
}

/**
 * visualizer.detect_silhouette。M0 は null（全面）を返す。
 * gray は M1 で必要になったときだけ計算して返す。
 */
export function detectSilhouette(rgba, w, h, cfg) {
  const mode = cfg.detect_mode;
  if (mode === 'm0') return { mask: null };

  let mask, kClose, minAreaRatio;
  if (mode === 'm4') {
    mask = maskChroma(rgba, w, h, cfg);
    kClose = 15; minAreaRatio = 0.005;
  } else {
    // m1 AUTO（m2/m3 は Web 版 v0.1 では m1 に降格）
    const gray = toGray(rgba, w, h);
    const m = cornerMargin(w, h);
    let sum = 0, cnt = 0;
    forEachCorner(w, h, m, (i) => { sum += gray[i]; cnt++; });
    const bgBright = sum / cnt;
    if (bgBright < 40) {
      const th = Math.min(255, Math.max(cfg.threshold, Math.trunc(bgBright + cfg.threshold)));
      mask = new Uint8Array(w * h);
      for (let i = 0; i < mask.length; i++) mask[i] = gray[i] > th ? 255 : 0;
      kClose = 11; minAreaRatio = 0.003;
    } else {
      mask = maskChroma(rgba, w, h, { ...cfg, bg_color_hsv: null });
      kClose = 15; minAreaRatio = 0.01;
    }
  }
  mask = postprocessMask(mask, w, h, kClose, minAreaRatio, false);
  if (cfg.mask_invert) for (let i = 0; i < mask.length; i++) mask[i] = 255 - mask[i];
  return { mask };
}

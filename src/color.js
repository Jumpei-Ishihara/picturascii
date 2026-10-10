// OpenCV 8bit の色変換を再現する。色はデスクトップ版と同じ BGR 配列で扱う。

const SDIV = new Int32Array(256);
const HDIV = new Int32Array(256);
for (let i = 1; i < 256; i++) {
  SDIV[i] = Math.round((255 << 12) / i);
  HDIV[i] = Math.round((180 << 12) / (6 * i));
}

/** cv2.COLOR_BGR2HSV（8bit、H は 0〜179）。結果を out[0..2] に書く。 */
export function bgr2hsv(b, g, r, out) {
  let v = b, vmin = b;
  if (g > v) v = g; if (r > v) v = r;
  if (g < vmin) vmin = g; if (r < vmin) vmin = r;
  const diff = v - vmin;
  const s = (diff * SDIV[v] + (1 << 11)) >> 12;
  let h;
  if (v === r) h = g - b;
  else if (v === g) h = b - r + 2 * diff;
  else h = r - g + 4 * diff;
  h = (h * HDIV[diff] + (1 << 11)) >> 12;
  if (h < 0) h += 180;
  out[0] = h; out[1] = s; out[2] = v;
  return out;
}

const f32 = Math.fround;

/** 偶数丸め（cvRound = lrint と同じ） */
export function roundHalfEven(x) {
  const r = Math.round(x);
  return (r - x === 0.5 && r % 2 !== 0) ? r - 1 : r;
}

/** cv2.COLOR_HSV2BGR（8bit 入力）。OpenCV と同じく float32 で計算する。 */
export function hsv2bgr(h, s, v) {
  const sf = f32(s * f32(1 / 255)), vf = f32(v * f32(1 / 255));
  if (sf === 0) {
    const g = roundHalfEven(f32(vf * 255));
    return [g, g, g];
  }
  let hf = f32(h * f32(6 / 180));
  hf = f32(hf % 6);
  let sector = Math.floor(hf);
  let f = f32(hf - sector);
  if (sector < 0 || sector >= 6) { sector = 0; f = 0; }
  const tab = [
    vf,
    f32(vf * f32(1 - sf)),
    f32(vf * f32(1 - f32(sf * f))),
    f32(vf * f32(1 - f32(sf * f32(1 - f)))),
  ];
  const SECTORS = [[1, 3, 0], [1, 0, 2], [3, 0, 1], [0, 2, 1], [0, 1, 3], [2, 1, 0]];
  const [bi, gi, ri] = SECTORS[sector];
  const q = (x) => Math.min(255, Math.max(0, roundHalfEven(f32(x * 255))));
  return [q(tab[bi]), q(tab[gi]), q(tab[ri])];
}

/** visualizer._shift_hue：BGR 色の色相を shiftDeg 度回転する。 */
export function shiftHue(bgr, shiftDeg) {
  const hsv = bgr2hsv(bgr[0], bgr[1], bgr[2], [0, 0, 0]);
  const h = (hsv[0] + Math.floor(shiftDeg / 2)) % 180;
  return hsv2bgr(h, hsv[1], hsv[2]);
}

/** "#rrggbb" → BGR 配列 */
export function hexToBgr(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
}

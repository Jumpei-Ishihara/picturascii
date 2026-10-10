// 1フレームの処理（visualizer.process_frame の Web 版）

import { DEFAULT_CONFIG, resolveChars } from './config.js';
import { detectSilhouette } from './detect.js';
import { buildLayer } from './grid.js';
import { GlyphAtlas } from './atlas.js';
import { GlRenderer } from './gl.js';

function makeGrabber() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return (source, w, h, mirror) => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
    return ctx.getImageData(0, 0, w, h).data;
  };
}

export class Picturascii {
  /**
   * @param {HTMLCanvasElement} outCanvas 出力先
   * @param {URL|string} assetsUrl assets/ ディレクトリの URL（末尾 / 付き）
   */
  constructor(outCanvas, assetsUrl) {
    this.gl = new GlRenderer(outCanvas);
    this.atlas = new GlyphAtlas(assetsUrl);
    this.grabFull = makeGrabber();
    this.grabSmall = makeGrabber();
    this.buffers = {};
    this.last = null; // 直近フレームの元画素（スポイト用）
  }

  /** 設定に既定値を補い、使う文字のグリフを読み込む */
  async prepare(cfg) {
    const full = { ...DEFAULT_CONFIG, ...cfg };
    await this.atlas.load(resolveChars(full));
    return full;
  }

  /** RGBA 画素を処理して出力 canvas に描く。cfg は prepare() 済みのもの。 */
  renderPixels(rgba, w, h, frameIdx, cfg, det = null) {
    const t0 = performance.now();
    const { mask, mw = w, mh = h } = det ?? detectSilhouette(rgba, w, h, cfg);
    const t1 = performance.now();
    const layer = buildLayer({ rgba, w, h, mask, mw, mh, frameIdx, cfg, atlas: this.atlas, buffers: this.buffers });
    const t2 = performance.now();
    this.gl.render(layer, rgba, w, h, cfg);
    const t3 = performance.now();
    this.last = { rgba, w, h };
    return { detectMs: t1 - t0, gridMs: t2 - t1, glMs: t3 - t2 };
  }

  /**
   * 画像・動画・canvas を w×h で処理する。
   * 検出は detectWidth を上限に縮小して行う（マスクはセル中心でしか参照しないため）。
   */
  renderSource(source, w, h, frameIdx, cfg, { mirror = false, detectWidth = 480 } = {}) {
    const rgba = this.grabFull(source, w, h, mirror);
    let det = { mask: null };
    const t0 = performance.now();
    if (cfg.detect_mode !== 'm0') {
      if (w > detectWidth) {
        const dw = detectWidth, dh = Math.max(1, Math.round((h * dw) / w));
        const small = this.grabSmall(source, dw, dh, mirror);
        det = { ...detectSilhouette(small, dw, dh, cfg, dw / w), mw: dw, mh: dh };
      } else {
        det = detectSilhouette(rgba, w, h, cfg);
      }
    }
    const detectMs = performance.now() - t0;
    const timing = this.renderPixels(rgba, w, h, frameIdx, cfg, det);
    return { ...timing, detectMs };
  }
}

// 1フレームの処理（visualizer.process_frame の Web 版）

import { DEFAULT_CONFIG, resolveChars } from './config.js';
import { detectSilhouette } from './detect.js';
import { buildLayer } from './grid.js';
import { GlyphAtlas } from './atlas.js';
import { GlRenderer } from './gl.js';
import { PersonSegmenter } from './person.js';

function makeGrabber() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const grab = (source, w, h, mirror) => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
    return ctx.getImageData(0, 0, w, h).data;
  };
  grab.canvas = canvas;
  return grab;
}

const DETECT_CFG_KEYS = ['detect_mode', 'threshold', 'mp_confidence', 'mp_smooth_edge', 'mp_detail_mode',
  'hue_tolerance', 'sat_min', 'bg_color_hsv', 'mask_invert'];
const detectKey = (cfg) => JSON.stringify(DETECT_CFG_KEYS.map((k) => cfg[k]));

export class Picturascii {
  /**
   * @param {HTMLCanvasElement} outCanvas 出力先
   * @param {URL|string} assetsUrl assets/ ディレクトリの URL（末尾 / 付き）
   */
  constructor(outCanvas, assetsUrl, vendorUrl = new URL('../vendor/mediapipe/', assetsUrl)) {
    this.gl = new GlRenderer(outCanvas);
    this.person = new PersonSegmenter(vendorUrl);
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
  renderSource(source, w, h, frameIdx, cfg, { mirror = false, detectWidth = 480, staticKey = null } = {}) {
    const rgba = this.grabFull(source, w, h, mirror);
    let det = { mask: null };
    const t0 = performance.now();
    // 静止画は入力が変わらないので、検出設定が同じなら前回のマスクを使う
    const key = staticKey && `${staticKey}|${w}x${h}|${detectKey(cfg)}|${this.person.state}`;
    if (key && this.detCache?.key === key) {
      det = this.detCache.det;
    } else if (cfg.detect_mode !== 'm0') {
      const dw = Math.min(w, detectWidth), dh = Math.max(1, Math.round((h * dw) / w));
      const small = dw < w ? this.grabSmall(source, dw, dh, mirror) : rgba;
      let prob = null;
      if (cfg.detect_mode === 'm2') {
        if (this.person.state === 'idle') this.person.load();
        if (this.person.state === 'ready') {
          // セグメンテーションには canvas を渡す（縮小しない場合も同じ canvas に描く）
          if (dw === w) this.grabSmall(source, dw, dh, mirror);
          try { prob = this.person.segment(this.grabSmall.canvas, dw, dh); } catch (e) { console.warn(e); }
        }
      }
      det = { ...detectSilhouette(small, dw, dh, cfg, dw / w, prob), mw: dw, mh: dh };
      this.detCache = key ? { key, det } : null;
    }
    const detectMs = performance.now() - t0;
    const timing = this.renderPixels(rgba, w, h, frameIdx, cfg, det);
    return { ...timing, detectMs };
  }
}

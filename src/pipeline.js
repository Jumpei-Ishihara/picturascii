// 1フレームの処理（visualizer.process_frame の Web 版）

import { DEFAULT_CONFIG, resolveChars } from './config.js';
import { detectSilhouette } from './detect.js';
import { buildLayer } from './grid.js';
import { GlyphAtlas } from './atlas.js';
import { GlRenderer } from './gl.js';

export class Picturascii {
  /**
   * @param {HTMLCanvasElement} outCanvas 出力先
   * @param {URL|string} assetsUrl assets/ ディレクトリの URL（末尾 / 付き）
   */
  constructor(outCanvas, assetsUrl) {
    this.gl = new GlRenderer(outCanvas);
    this.atlas = new GlyphAtlas(assetsUrl);
    this.scratch = document.createElement('canvas');
    this.ctx = this.scratch.getContext('2d', { willReadFrequently: true });
  }

  /** 設定に既定値を補い、使う文字のグリフを読み込む */
  async prepare(cfg) {
    const full = { ...DEFAULT_CONFIG, ...cfg };
    await this.atlas.load(resolveChars(full));
    return full;
  }

  /** 画像・動画・canvas から RGBA 画素を取り出す */
  grab(source, w, h, mirror = false) {
    if (this.scratch.width !== w || this.scratch.height !== h) {
      this.scratch.width = w; this.scratch.height = h;
    }
    this.ctx.save();
    if (mirror) { this.ctx.translate(w, 0); this.ctx.scale(-1, 1); }
    this.ctx.drawImage(source, 0, 0, w, h);
    this.ctx.restore();
    return this.ctx.getImageData(0, 0, w, h).data;
  }

  /** RGBA 画素を処理して出力 canvas に描く。cfg は prepare() 済みのもの。 */
  renderPixels(rgba, w, h, frameIdx, cfg) {
    const t0 = performance.now();
    const { mask } = detectSilhouette(rgba, w, h, cfg);
    const t1 = performance.now();
    const layer = buildLayer({ rgba, w, h, mask, frameIdx, cfg, atlas: this.atlas });
    const t2 = performance.now();
    this.gl.render(layer, rgba, w, h, cfg);
    const t3 = performance.now();
    return { detectMs: t1 - t0, gridMs: t2 - t1, glMs: t3 - t2 };
  }
}

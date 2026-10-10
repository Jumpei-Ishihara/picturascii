// グリフタイル。ASCII はデスクトップ版から書き出した Hershey Duplex のシートを使い、
// それ以外の文字はブラウザのフォントで描いたタイルを代わりに使う。

export class GlyphAtlas {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.meta = null;
    this.sheets = new Map();   // char -> { data, w }
    this.fallback = new Map(); // `${char}|${q}` -> tile
  }

  async init() {
    if (!this.meta) {
      const res = await fetch(new URL('glyphs.json', this.baseUrl));
      this.meta = await res.json();
    }
  }

  /** 使う文字のシートを読み込む（ASCII 以外は不要） */
  async load(chars) {
    await this.init();
    const jobs = [];
    for (const ch of chars) {
      const g = this.meta.glyphs[ch];
      if (!g || this.sheets.has(ch)) continue;
      jobs.push((async () => {
        // img.decode() は非表示タブで止まることがあるため createImageBitmap を使う
        const res = await fetch(new URL(`glyphs/${g.file}`, this.baseUrl));
        const img = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const cv = document.createElement('canvas');
        cv.width = g.w; cv.height = g.h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        img.close();
        const px = ctx.getImageData(0, 0, g.w, g.h).data;
        const data = new Uint8Array(g.w * g.h);
        for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
        this.sheets.set(ch, { data, w: g.w });
      })());
    }
    await Promise.all(jobs);
  }

  /**
   * visualizer._get_glyph_tile と同じ量子化（0.05刻み）でタイルを返す。
   * 戻り値: { data, stride, x, y, w, h, gox, goy }（w=0 なら描画なし）
   */
  tile(ch, fscale) {
    const q = Math.min(this.meta.scaleSteps - 1, Math.max(0, Math.round(fscale * 20)));
    const sheet = this.sheets.get(ch);
    if (sheet) {
      const [x, y, w, h, gox, goy] = this.meta.glyphs[ch].rects[q];
      return { data: sheet.data, stride: sheet.w, x, y, w, h, gox, goy };
    }
    return this._fallbackTile(ch, q);
  }

  _fallbackTile(ch, q) {
    const key = `${ch}|${q}`;
    if (this.fallback.has(key)) return this.fallback.get(key);
    const size = Math.max(4, Math.trunc((q / 20) * 23));
    const ts = Math.max(size * 3, 16);
    const cv = document.createElement('canvas');
    cv.width = ts; cv.height = ts;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.font = `${size}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, ts / 2, ts / 2);
    const px = ctx.getImageData(0, 0, ts, ts).data;
    let x0 = ts, y0 = ts, x1 = -1, y1 = -1;
    for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
      if (px[(y * ts + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    let t;
    if (x1 < 0) {
      t = { data: new Uint8Array(0), stride: 0, x: 0, y: 0, w: 0, h: 0, gox: 0, goy: 0 };
    } else {
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const data = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        data[y * w + x] = px[((y + y0) * ts + x + x0) * 4 + 3];
      }
      t = { data, stride: w, x: 0, y: 0, w, h, gox: w >> 1, goy: h >> 1 };
    }
    this.fallback.set(key, t);
    return t;
  }
}

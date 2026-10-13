// M2 PERSON 用の人物セグメンテーション（MediaPipe Tasks Vision、vendor/ に同梱）。
// PERSON を選んだときに初めて読み込む。外部サーバーへは通信しない。

export class PersonSegmenter {
  constructor(vendorUrl) {
    this.vendorUrl = vendorUrl;
    this.state = 'idle'; // idle → loading → ready | error
    this.segmenter = null;
    this.lastTs = 0;
    this.promise = null;
  }

  load() {
    if (this.promise) return this.promise;
    this.state = 'loading';
    this.promise = (async () => {
      const base = new URL(this.vendorUrl);
      const { ImageSegmenter } = await import(new URL('vision_bundle.mjs', base).href);
      const fileset = {
        wasmLoaderPath: new URL('wasm/vision_wasm_internal.js', base).href,
        wasmBinaryPath: new URL('wasm/vision_wasm_internal.wasm', base).href,
      };
      const modelAssetPath = new URL('selfie_segmenter_landscape.tflite', base).href;
      let lastError;
      for (const delegate of ['GPU', 'CPU']) {
        try {
          this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
          this.delegate = delegate;
          this.state = 'ready';
          return this;
        } catch (e) {
          lastError = e;
        }
      }
      this.state = 'error';
      throw lastError;
    })();
    this.promise.catch(() => {});
    return this.promise;
  }

  /** source（canvas 等）の人物らしさを w×h の Float32Array（0〜1）で返す */
  segment(source, w, h) {
    // VIDEO モードはタイムスタンプが単調増加している必要がある
    const ts = Math.max(performance.now(), this.lastTs + 1);
    this.lastTs = ts;
    const res = this.segmenter.segmentForVideo(source, ts);
    try {
      const masks = res.confidenceMasks;
      const m = masks[masks.length - 1]; // 人物クラス（単一出力のモデルでは唯一のマスク）
      const prob = m.getAsFloat32Array();
      if (m.width === w && m.height === h) return prob.slice();
      throw new Error(`unexpected mask size ${m.width}x${m.height}`);
    } finally {
      res.close();
    }
  }
}

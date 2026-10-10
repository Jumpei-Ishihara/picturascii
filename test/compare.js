// Python 参照画像と JS 版の描画結果を比較する
import { Picturascii } from '../src/pipeline.js';

// 合格基準（見た目が大きく変わらないこと）
const MIN_PSNR = 30;
const MAX_BIG_DIFF = 0.01; // |Δ|>32 の画素が 1% 未満

const loadImage = async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
};

function pixelsOf(img) {
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, cv.width, cv.height).data;
}

function toCanvas(rgba, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return cv;
}

function metrics(a, b, w, h) {
  let se = 0, ae = 0, big = 0;
  const diff = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let m = 0;
    for (let k = 0; k < 3; k++) {
      const d = a[i * 4 + k] - b[i * 4 + k];
      se += d * d; ae += Math.abs(d);
      m = Math.max(m, Math.abs(d));
    }
    if (m > 32) big++;
    diff[i * 4] = Math.min(255, m * 4);
    diff[i * 4 + 1] = Math.min(255, m * 4) >> 2;
    diff[i * 4 + 2] = Math.min(255, m * 4) >> 2;
    diff[i * 4 + 3] = 255;
  }
  const mse = se / (w * h * 3);
  return {
    psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse),
    meanAbs: ae / (w * h * 3),
    bigRatio: big / (w * h),
    diff,
  };
}

async function main() {
  const cases = await (await fetch('./cases.json')).json();
  const out = document.createElement('canvas');
  const app = new Picturascii(out, new URL('../assets/', import.meta.url));
  const results = [];
  const tbody = document.querySelector('#summary tbody');
  for (const c of cases) {
    const src = await loadImage(`./fixtures/${c.image}`);
    const ref = await loadImage(`./reference/${c.id}.png`);
    const w = src.naturalWidth, h = src.naturalHeight;
    const cfg = await app.prepare(c.cfg);
    const rgba = pixelsOf(src);
    const timing = app.renderPixels(rgba, w, h, c.frame, cfg);
    const js = app.gl.readPixels();
    const m = metrics(js, pixelsOf(ref), w, h);
    const pass = m.psnr >= MIN_PSNR && m.bigRatio < MAX_BIG_DIFF;
    results.push({ id: c.id, psnr: +m.psnr.toFixed(2), meanAbs: +m.meanAbs.toFixed(3), bigRatio: +m.bigRatio.toFixed(5), ...timing, pass });

    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.id}</td><td>${m.psnr.toFixed(2)}</td><td>${m.meanAbs.toFixed(3)}</td>`
      + `<td>${(m.bigRatio * 100).toFixed(3)}%</td><td>${timing.detectMs.toFixed(1)}</td>`
      + `<td>${timing.gridMs.toFixed(1)}</td><td>${timing.glMs.toFixed(1)}</td>`
      + `<td class="${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</td>`;
    tbody.append(tr);

    const box = document.createElement('div');
    box.className = 'case';
    box.innerHTML = `<div>${c.id}</div><div class="row"></div>`;
    const row = box.querySelector('.row');
    for (const [label, cv] of [['python', toCanvas(pixelsOf(ref), w, h)], ['js', toCanvas(js, w, h)], ['|Δ|×4', toCanvas(m.diff, w, h)]]) {
      const fig = document.createElement('figure');
      fig.append(cv);
      const cap = document.createElement('figcaption');
      cap.textContent = label;
      fig.append(cap);
      row.append(fig);
    }
    document.querySelector('#cases').append(box);
  }
  window.__parity = { done: true, results, allPass: results.every((r) => r.pass) };
}

main().catch((e) => {
  window.__parity = { done: true, error: String(e.stack || e) };
  document.body.prepend(Object.assign(document.createElement('pre'), { textContent: String(e.stack || e), className: 'fail' }));
});

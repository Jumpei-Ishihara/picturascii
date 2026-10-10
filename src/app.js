// PICTURASCII — 画面全体の制御（素材・描画ループ・保存・録画）

import { Picturascii } from './pipeline.js';
import { DEFAULT_CONFIG, dynamicCellSize } from './config.js';
import { bgr2hsv } from './color.js';
import { buildPanel } from './controls.js';
import { PRESETS, DETECT_KEYS } from './presets.js';
import { SampleScene } from './scene.js';

const STORE_KEY = 'picturascii:cfg';
const $ = (sel) => document.querySelector(sel);

const els = {
  out: $('#out'),
  stage: $('#stage'),
  hudL: $('#hud-left'),
  hudR: $('#hud-right'),
  rec: $('#rec-indicator'),
  msg: $('#stage-msg'),
  file: $('#file'),
  play: $('#btn-play'),
  snap: $('#btn-snap'),
  recBtn: $('#btn-rec'),
  size: $('#out-size'),
  srcBtns: [...document.querySelectorAll('[data-src]')],
  presets: $('#presets'),
  panel: $('#panel'),
};

const state = {
  raw: loadCfg(),          // ユーザー設定（既定値との差分を含む全体）
  cfg: null,               // prepare 済み設定
  prepVersion: 0,
  source: null,            // { kind, el, w, h, mirror }
  playing: true,
  clock: 0,
  lastNow: performance.now(),
  dirty: true,
  picking: false,
  fps: 0,
  lastRenderAt: 0,
  recorder: null,
  recStart: 0,
};

function loadCfg() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_CONFIG, ...saved };
  } catch { /* 保存できない環境では既定値を使う */ }
  return { ...DEFAULT_CONFIG };
}

function saveCfg() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.raw)); } catch { /* 無視 */ }
}

// ── 初期化 ───────────────────────────────────────────────────────────────────

let app;
try {
  app = new Picturascii(els.out, new URL('../assets/', import.meta.url));
} catch (e) {
  showMessage('This browser does not support WebGL2. Please try the latest Chrome, Safari, or Firefox.');
  throw e;
}

const scene = new SampleScene();
const syncPanel = buildPanel(els.panel, () => state.raw, updateCfg, { onPick: startPick });

function updateCfg(patch) {
  state.raw = { ...state.raw, ...patch };
  saveCfg();
  syncPanel();
  markPresets();
  const v = ++state.prepVersion;
  const apply = (full) => {
    if (v !== state.prepVersion) return;
    state.cfg = full;
    state.dirty = true;
  };
  // グリフの読み込みに失敗しても、ブラウザのフォントで描画を続ける
  app.prepare(state.raw).then(apply, (e) => {
    console.warn('glyph sheets unavailable, using browser fonts', e);
    apply({ ...DEFAULT_CONFIG, ...state.raw });
  });
}

for (const p of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = p.label;
  b.dataset.preset = p.id;
  b.addEventListener('click', () => {
    const keep = Object.fromEntries(DETECT_KEYS.map((k) => [k, state.raw[k]]));
    state.raw = { ...DEFAULT_CONFIG, ...p.cfg, ...keep };
    updateCfg({});
  });
  els.presets.append(b);
}
$('#btn-reset').addEventListener('click', () => {
  state.raw = { ...DEFAULT_CONFIG };
  updateCfg({});
});

function markPresets() {
  for (const p of PRESETS) {
    const want = { ...DEFAULT_CONFIG, ...p.cfg };
    const same = Object.keys(want).every((k) => DETECT_KEYS.includes(k)
      || JSON.stringify(want[k]) === JSON.stringify(state.raw[k]));
    els.presets.querySelector(`[data-preset="${p.id}"]`).setAttribute('aria-pressed', String(same));
  }
}

// ── 素材 ─────────────────────────────────────────────────────────────────────

function stopSource() {
  const s = state.source;
  if (!s) return;
  if (s.kind === 'camera') s.el.srcObject?.getTracks().forEach((t) => t.stop());
  if (s.kind === 'video') s.el.pause();
  if (s.kind === 'image') s.el.close();
  if (s.url) URL.revokeObjectURL(s.url);
  state.source = null;
}

function setSource(src) {
  stopSource();
  state.source = src;
  state.dirty = true;
  els.srcBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === src.kind)));
  hideMessage();
  if (src.kind === 'video' && state.playing) src.el.play().catch(() => {});
}

function useSample() {
  setSource({ kind: 'sample', el: scene.canvas, w: scene.width, h: scene.height });
}

async function useFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('image/')) {
      URL.revokeObjectURL(url);
      const img = await createImageBitmap(file); // EXIF の向きを反映する
      setSource({ kind: 'image', el: img, w: img.width, h: img.height });
    } else if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.src = url;
      await new Promise((ok, ng) => { v.onloadeddata = ok; v.onerror = () => ng(new Error('video')); });
      setSource({ kind: 'video', el: v, w: v.videoWidth, h: v.videoHeight, url });
    } else {
      URL.revokeObjectURL(url);
      showMessage('Please choose an image or video file.', true);
    }
  } catch {
    URL.revokeObjectURL(url);
    showMessage('This file could not be opened. Try another format.', true);
  }
}

async function useCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.srcObject = stream;
    await v.play();
    setSource({ kind: 'camera', el: v, w: v.videoWidth, h: v.videoHeight, mirror: true });
  } catch {
    showMessage('Camera unavailable. Check the camera permission for this site.', true);
  }
}

els.srcBtns.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.src === 'sample') useSample();
  else if (b.dataset.src === 'camera') useCamera();
  else els.file.click();
}));
els.file.addEventListener('change', () => { useFile(els.file.files[0]); els.file.value = ''; });

// ページ全体へのドラッグ&ドロップ
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  useFile(e.dataTransfer.files[0]);
});

// ── 描画 ─────────────────────────────────────────────────────────────────────

function outputSize() {
  const s = state.source;
  const cap = Number(els.size.value) || 4096;
  const w = Math.min(s.w, cap);
  return [w, Math.max(1, Math.round((s.h * w) / s.w))];
}

function render() {
  const s = state.source;
  const cfg = state.cfg;
  if (s.kind === 'sample') scene.draw(state.clock);
  const [w, h] = outputSize();
  const frameIdx = Math.floor(state.clock * 30);
  const t = app.renderSource(s.el, w, h, frameIdx, cfg, { mirror: !!s.mirror });
  const now = performance.now();
  const dt = now - state.lastRenderAt;
  state.lastRenderAt = now;
  if (dt > 0 && dt < 1000) state.fps = state.fps ? state.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  const cell = dynamicCellSize(frameIdx, cfg);
  els.hudL.textContent = `${s.kind.toUpperCase()} · ${w}×${h} · CELL ${cell}px`;
  els.hudR.textContent = `${state.playing ? `${Math.round(state.fps)} FPS` : 'PAUSED'} · ${(t.detectMs + t.gridMs + t.glMs).toFixed(0)} ms`;
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - state.lastNow) / 1000);
  state.lastNow = now;
  if (state.playing) state.clock += dt;
  if (state.recorder) els.rec.textContent = `● REC ${formatTime((now - state.recStart) / 1000)}`;
  if (!state.cfg || !state.source) return;
  if (!state.playing && !state.dirty) return;
  state.dirty = false;
  render();
}

const formatTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function setPlaying(on) {
  state.playing = on;
  state.dirty = true;
  els.play.textContent = on ? '❚❚ PAUSE' : '▶ PLAY';
  els.play.setAttribute('aria-pressed', String(!on));
  const s = state.source;
  if (s?.kind === 'video') (on ? s.el.play() : s.el.pause())?.catch?.(() => {});
}

els.play.addEventListener('click', () => setPlaying(!state.playing));
els.size.addEventListener('change', () => { state.dirty = true; });
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('input, select, textarea, button')) return;
  e.preventDefault();
  setPlaying(!state.playing);
});

// ── 保存・録画 ───────────────────────────────────────────────────────────────

const stamp = () => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
};

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

els.snap.addEventListener('click', () => {
  if (!state.source || !state.cfg) return;
  render();
  els.out.toBlob((b) => b && download(b, `picturascii-${stamp()}.jpg`), 'image/jpeg', 0.92);
});

function pickMime() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
}

els.recBtn.addEventListener('click', () => {
  if (state.recorder) { state.recorder.stop(); return; }
  const mime = pickMime();
  if (!mime || !els.out.captureStream) {
    showMessage('Recording is not supported in this browser.', true);
    return;
  }
  if (!state.playing) setPlaying(true);
  const chunks = [];
  const rec = new MediaRecorder(els.out.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: mime.split(';')[0] }), `picturascii-${stamp()}.${ext}`);
    state.recorder = null;
    els.recBtn.textContent = '● REC';
    els.recBtn.setAttribute('aria-pressed', 'false');
    els.rec.hidden = true;
  };
  rec.start(1000);
  state.recorder = rec;
  state.recStart = performance.now();
  els.recBtn.textContent = '■ STOP';
  els.recBtn.setAttribute('aria-pressed', 'true');
  els.rec.hidden = false;
});

// ── スポイト（CHROMA のキー色） ──────────────────────────────────────────────

function startPick() {
  if (!state.source) return;
  state.picking = true;
  els.stage.classList.add('picking');
  showMessage('Click the background color to key out (Esc to cancel)', false, true);
}

function endPick() {
  state.picking = false;
  els.stage.classList.remove('picking');
  hideMessage();
}

els.out.addEventListener('click', (e) => {
  if (!state.picking || !app.last) return;
  const r = els.out.getBoundingClientRect();
  const { rgba, w, h } = app.last;
  const x = Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * h)));
  const p = (y * w + x) * 4;
  const hsv = bgr2hsv(rgba[p + 2], rgba[p + 1], rgba[p], [0, 0, 0]);
  endPick();
  updateCfg({ bg_color_hsv: hsv });
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.picking) endPick(); });

// ── メッセージ ───────────────────────────────────────────────────────────────

let msgTimer = 0;
function showMessage(text, transient = false, sticky = false) {
  els.msg.textContent = text;
  els.msg.hidden = false;
  clearTimeout(msgTimer);
  if (transient && !sticky) msgTimer = setTimeout(hideMessage, 4000);
}
function hideMessage() { els.msg.hidden = true; }

// ── 開始 ─────────────────────────────────────────────────────────────────────

// 小さい画面では処理を軽くする
if (matchMedia('(max-width: 900px)').matches) els.size.value = '960';
updateCfg({});
useSample();
requestAnimationFrame(tick);
window.__picturascii = { state, app };

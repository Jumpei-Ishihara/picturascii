// 操作パネルの定義と生成。範囲・刻みはデスクトップ版 preview_v3.html の PARAMS と同じ。

const sl = (key, label, min, max, step, unit = '', extra = {}) => ({ type: 'slider', key, label, min, max, step, unit, ...extra });

export const SECTIONS = [
  {
    id: 'detect', title: 'DETECT', open: true,
    controls: [
      { type: 'segmented', key: 'detect_mode', label: 'MODE', options: [['m0', 'FULL'], ['m1', 'AUTO'], ['m4', 'CHROMA']] },
      sl('threshold', 'THRESHOLD', 0, 120, 1, '', { show: (c) => c.detect_mode === 'm1' }),
      { type: 'eyedrop', key: 'bg_color_hsv', label: 'KEY COLOR', show: (c) => c.detect_mode === 'm4' },
      sl('hue_tolerance', 'HUE TOLERANCE', 5, 60, 1, '', { show: (c) => c.detect_mode === 'm4' }),
      sl('sat_min', 'SAT MIN', 0, 150, 5, '', { show: (c) => c.detect_mode === 'm4' }),
      { type: 'toggle', key: 'mask_invert', label: 'INVERT', show: (c) => c.detect_mode !== 'm0' },
    ],
  },
  {
    id: 'chars', title: 'CHARACTERS', open: true,
    controls: [
      {
        type: 'select', key: 'char_set', label: 'SET',
        options: [['digits', '0–9'], ['hex', '0–F'], ['binary', '0 1'], ['ascii', '.:-=+*#%@'], ['symbols', '!#$%&*'], ['custom', 'CUSTOM']],
      },
      { type: 'text', key: 'custom_chars', label: 'TEXT', placeholder: 'PICTURASCII', show: (c) => c.char_set === 'custom' },
      { type: 'segmented', key: 'char_mode', label: 'PICK BY', options: [['density', 'BRIGHTNESS'], ['random', 'RANDOM']] },
      sl('cell_size', 'CELL SIZE', 4, 60, 1, 'px'),
      sl('font_scale_factor', 'FONT SCALE', 0.3, 2.0, 0.05, '×'),
      sl('digit_scale_min', 'CHAR SIZE MIN', 0.1, 2.0, 0.05, '×'),
      sl('digit_scale_max', 'CHAR SIZE MAX', 0.1, 2.0, 0.05, '×'),
    ],
  },
  {
    id: 'color', title: 'COLOR', open: true,
    controls: [
      { type: 'segmented', key: 'color_source', label: 'SOURCE', options: [['hue', 'HUE'], ['material', 'MATERIAL']] },
      sl('hue_shift', 'HUE SHIFT', 0, 360, 5, '°', { show: (c) => c.color_source === 'hue' }),
      sl('grid_intensity', 'INTENSITY', 0, 3, 0.05),
      sl('brightness_gamma', 'GAMMA', 0.3, 3, 0.05),
      sl('color_range', 'COLOR RANGE', 0, 2, 0.05),
      sl('saturation', 'SATURATION', 0, 1, 0.01),
      sl('effect_brightness', 'EFFECT BRIGHTNESS', 0, 1, 0.01),
      { type: 'color', key: 'canvas_bg', label: 'BACKGROUND' },
    ],
  },
  {
    id: 'glow', title: 'GLOW', open: false,
    controls: [
      sl('glow_tight', 'TIGHT', 0, 2, 0.05),
      sl('glow_mid', 'MID', 0, 2, 0.05),
      sl('glow_bloom', 'BLOOM', 0, 2, 0.05),
      sl('pulse_amp', 'PULSE', 0, 0.5, 0.01),
    ],
  },
  {
    id: 'motion', title: 'MOTION', open: false,
    controls: [
      sl('anim_speed', 'SPEED', 0.1, 4, 0.1, '×'),
      sl('digit_period', 'CHAR CHANGE', 10, 300, 5, 'f', { hint: (v) => `${(v / 30).toFixed(1)}s` }),
      sl('size_max', 'SIZE MAX', 0.01, 3, 0.01, '×'),
      { type: 'toggle', key: 'size_anim', label: 'SIZE ANIM' },
      sl('size_min', 'SIZE MIN', 0.01, 2, 0.01, '×', { show: (c) => c.size_anim }),
      sl('size_period', 'SIZE PERIOD', 10, 600, 10, 'f', { show: (c) => c.size_anim }),
      sl('size_hold', 'SIZE HOLD', 0, 1, 0.05, '', { show: (c) => c.size_anim }),
    ],
  },
  {
    id: 'blend', title: 'BLEND', open: false,
    controls: [
      { type: 'segmented', key: 'composite_mode', label: 'MODE', options: [['normal', 'NORMAL'], ['add', 'ADD'], ['screen', 'SCREEN']] },
      sl('composite_alpha', 'MIX', 0, 1, 0.01),
      sl('grid_opacity', 'GRID OPACITY', 0, 1, 0.01),
    ],
  },
];

const decimals = (step) => (String(step).split('.')[1] || '').length;
const bgrToHex = (b) => `#${[b[2], b[1], b[0]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const hexToBgr = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n & 255, (n >> 8) & 255, (n >> 16) & 255];
};

/**
 * パネルを生成する。
 * @param {HTMLElement} root
 * @param {() => object} getCfg 現在の設定
 * @param {(patch: object) => void} onChange
 * @param {{ onPick: () => void }} hooks
 * @returns {() => void} 表示を設定に同期する関数
 */
export function buildPanel(root, getCfg, onChange, hooks) {
  const syncers = [];
  for (const sec of SECTIONS) {
    const det = document.createElement('details');
    det.className = 'sec';
    det.open = sec.open;
    det.innerHTML = `<summary>${sec.title}</summary>`;
    const body = document.createElement('div');
    body.className = 'sec-body';
    det.append(body);
    for (const c of sec.controls) {
      const row = document.createElement('div');
      row.className = `ctl ctl-${c.type}`;
      const id = `ctl-${c.key}`;
      let sync;
      if (c.type === 'slider') {
        row.innerHTML = `<label for="${id}">${c.label}</label>`
          + `<input id="${id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}">`
          + `<output for="${id}"></output>`;
        const input = row.querySelector('input');
        const out = row.querySelector('output');
        const d = decimals(c.step);
        const show = (v) => { out.textContent = `${Number(v).toFixed(d)}${c.unit}${c.hint ? ` · ${c.hint(v)}` : ''}`; };
        input.addEventListener('input', () => { show(input.value); onChange({ [c.key]: Number(input.value) }); });
        sync = (cfg) => { input.value = cfg[c.key]; show(cfg[c.key]); };
      } else if (c.type === 'segmented') {
        row.innerHTML = `<span class="lbl">${c.label}</span><div class="seg" role="radiogroup" aria-label="${c.label}"></div>`;
        const seg = row.querySelector('.seg');
        const btns = c.options.map(([v, label]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.setAttribute('role', 'radio');
          b.addEventListener('click', () => onChange({ [c.key]: v }));
          seg.append(b);
          return [v, b];
        });
        sync = (cfg) => btns.forEach(([v, b]) => b.setAttribute('aria-checked', String(cfg[c.key] === v)));
      } else if (c.type === 'select') {
        row.innerHTML = `<label for="${id}">${c.label}</label><select id="${id}"></select>`;
        const sel = row.querySelector('select');
        for (const [v, label] of c.options) sel.append(new Option(label, v));
        sel.addEventListener('change', () => onChange({ [c.key]: sel.value }));
        sync = (cfg) => { sel.value = cfg[c.key]; };
      } else if (c.type === 'text') {
        row.innerHTML = `<label for="${id}">${c.label}</label><input id="${id}" type="text" maxlength="64" spellcheck="false" autocomplete="off" placeholder="${c.placeholder || ''}">`;
        const input = row.querySelector('input');
        input.addEventListener('input', () => onChange({ [c.key]: input.value }));
        sync = (cfg) => { if (document.activeElement !== input) input.value = cfg[c.key]; };
      } else if (c.type === 'toggle') {
        row.innerHTML = `<span class="lbl">${c.label}</span><button type="button" class="tgl" role="switch"></button>`;
        const b = row.querySelector('button');
        b.setAttribute('aria-label', c.label);
        b.addEventListener('click', () => onChange({ [c.key]: !getCfg()[c.key] }));
        sync = (cfg) => { b.setAttribute('aria-checked', String(!!cfg[c.key])); b.textContent = cfg[c.key] ? 'ON' : 'OFF'; };
      } else if (c.type === 'color') {
        row.innerHTML = `<label for="${id}">${c.label}</label><input id="${id}" type="color">`;
        const input = row.querySelector('input');
        input.addEventListener('input', () => onChange({ [c.key]: hexToBgr(input.value) }));
        sync = (cfg) => { input.value = bgrToHex(cfg[c.key]); };
      } else if (c.type === 'eyedrop') {
        row.innerHTML = `<span class="lbl">${c.label}</span><span class="swatch" aria-hidden="true"></span>`
          + '<span class="eye-val"></span><button type="button" class="btn-sm pick">PICK</button><button type="button" class="btn-sm auto">AUTO</button>';
        const sw = row.querySelector('.swatch');
        const val = row.querySelector('.eye-val');
        row.querySelector('.pick').addEventListener('click', () => hooks.onPick());
        row.querySelector('.auto').addEventListener('click', () => onChange({ bg_color_hsv: null }));
        sync = (cfg) => {
          const hsv = cfg.bg_color_hsv;
          val.textContent = hsv ? `H${hsv[0]} S${hsv[1]} V${hsv[2]}` : 'CORNERS';
          sw.style.background = hsv ? `hsl(${hsv[0] * 2} ${Math.round((hsv[1] / 255) * 100)}% ${Math.round((hsv[2] / 255) * 50)}%)` : 'transparent';
        };
      }
      syncers.push((cfg) => {
        row.hidden = c.show ? !c.show(cfg) : false;
        sync?.(cfg);
      });
      body.append(row);
    }
    root.append(det);
  }
  return () => { const cfg = getCfg(); syncers.forEach((s) => s(cfg)); };
}

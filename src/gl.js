// WebGL2 によるグロー合成と最終合成。
// visualizer._multi_glow / draw_silhouette_grid 末尾 / process_frame 末尾 / _composite の移植。
// 中間テクスチャは OpenCV と同じく 8bit に丸めて保持する（ブラーの横パスのみ float）。

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// INTER_AREA（任意倍率の面積平均）。出力は 0〜255 の整数値を /255 して書く。
const FS_AREA = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 scale; // src / dst
out vec4 o;
void main() {
  ivec2 d = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(src, 0);
  vec2 a = vec2(d) * scale, b = a + scale;
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 4; j++) {
    float y = floor(a.y) + float(j);
    float wy = min(b.y, y + 1.0) - max(a.y, y);
    if (wy <= 0.0 || int(y) >= sz.y) continue;
    for (int i = 0; i < 4; i++) {
      float x = floor(a.x) + float(i);
      float wx = min(b.x, x + 1.0) - max(a.x, x);
      if (wx <= 0.0 || int(x) >= sz.x) continue;
      acc += texelFetch(src, ivec2(int(x), int(y)), 0) * 255.0 * wx * wy;
    }
  }
  o = floor(acc / (scale.x * scale.y) + 0.5) / 255.0;
}`;

// 1次元ガウスブラー（BORDER_REFLECT_101）。dir=(1,0) or (0,1)
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform ivec2 dir;
uniform int radius;
uniform float weights[11];
uniform bool quantize;
out vec4 o;
int reflect101(int i, int n) {
  if (n == 1) return 0;
  if (i < 0) i = -i;
  if (i >= n) i = 2 * n - 2 - i;
  return i;
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(src, 0);
  vec4 acc = vec4(0.0);
  for (int k = -10; k <= 10; k++) {
    if (k < -radius || k > radius) continue;
    ivec2 q = c + dir * k;
    q = ivec2(reflect101(q.x, sz.x), reflect101(q.y, sz.y));
    acc += texelFetch(src, q, 0) * weights[k < 0 ? -k : k];
  }
  o = quantize ? floor(acc * 255.0 + 0.5) / 255.0 : acc;
}`;

const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D layer, orig, tightT, midT, bloomT;
uniform vec3 wGlow;          // tight, mid, bloom
uniform vec3 bg;             // RGB 0〜255
uniform float eb, opacity, compAlpha;
uniform int compMode;        // 0=normal 1=add 2=screen
uniform int outH;
out vec4 o;

vec3 fetch(sampler2D t, ivec2 p) { return texelFetch(t, p, 0).rgb * 255.0; }

// cv2.resize(INTER_LINEAR) で (w,h) へ拡大した1画素（8bitに丸める）
vec3 upsample(sampler2D t, ivec2 p, ivec2 dst) {
  ivec2 s = textureSize(t, 0);
  vec2 f = (vec2(p) + 0.5) * vec2(s) / vec2(dst) - 0.5;
  vec2 i = floor(f); vec2 fr = f - i;
  ivec2 i0 = ivec2(i);
  if (i0.x < 0) { i0.x = 0; fr.x = 0.0; }
  if (i0.y < 0) { i0.y = 0; fr.y = 0.0; }
  if (i0.x >= s.x - 1) { i0.x = s.x - 1; fr.x = 0.0; }
  if (i0.y >= s.y - 1) { i0.y = s.y - 1; fr.y = 0.0; }
  ivec2 i1 = min(i0 + 1, s - 1);
  vec3 a = mix(fetch(t, i0), fetch(t, ivec2(i1.x, i0.y)), fr.x);
  vec3 b = mix(fetch(t, ivec2(i0.x, i1.y)), fetch(t, i1), fr.x);
  return floor(mix(a, b, fr.y) + 0.5);
}

void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), outH - 1 - int(gl_FragCoord.y));
  ivec2 dst = textureSize(layer, 0);
  vec3 g = fetch(layer, p);
  // cv2.addWeighted(out, 1, glow, w) を順に適用（毎回 8bit に飽和丸め）
  if (wGlow.x != 0.0) g = clamp(floor(g + upsample(tightT, p, dst) * wGlow.x + 0.5), 0.0, 255.0);
  if (wGlow.y != 0.0) g = clamp(floor(g + upsample(midT, p, dst) * wGlow.y + 0.5), 0.0, 255.0);
  if (wGlow.z != 0.0) g = clamp(floor(g + upsample(bloomT, p, dst) * wGlow.z + 0.5), 0.0, 255.0);

  vec3 c;
  if (bg == vec3(0.0)) {
    c = eb >= 1.0 ? g : clamp(floor(g * eb + 0.5), 0.0, 255.0);
  } else {
    float lum = max(g.r, max(g.g, g.b)) / 255.0;
    c = floor(clamp(bg * (1.0 - lum) + g * eb, 0.0, 255.0));
  }
  if (opacity < 1.0) {
    float a = max(0.0, opacity);
    c = floor(bg * (1.0 - a) + c * a);
  }
  if (!(compMode == 0 && compAlpha >= 1.0)) {
    vec3 s = fetch(orig, p);
    if (compMode == 1) c = floor(clamp(s + c * compAlpha, 0.0, 255.0));
    else if (compMode == 2) c = floor(clamp(255.0 - (255.0 - s) * (255.0 - c * compAlpha) / 255.0, 0.0, 255.0));
    else c = floor(s * (1.0 - compAlpha) + c * compAlpha);
  }
  o = vec4(c / 255.0, 1.0);
}`;

/** cv2.getGaussianKernel(k, 0) の片側（中心から） */
function gaussianHalf(k) {
  const sigma = 0.3 * ((k - 1) * 0.5 - 1) + 0.8;
  const r = (k - 1) / 2;
  const full = [];
  let sum = 0;
  for (let i = 0; i < k; i++) {
    const v = Math.exp(-((i - r) ** 2) / (2 * sigma * sigma));
    full.push(v); sum += v;
  }
  const half = new Float32Array(11);
  for (let i = 0; i <= r; i++) half[i] = full[r + i] / sum;
  return { radius: r, weights: half };
}

const KERNELS = { 9: gaussianHalf(9), 17: gaussianHalf(17), 21: gaussianHalf(21) };

export class GlRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.canvas = canvas;
    this.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    this.progs = {
      area: this._program(FS_AREA),
      blur: this._program(FS_BLUR),
      final: this._program(FS_FINAL),
    };
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.targets = new Map();
  }

  _program(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace('[0]', '');
      loc[name] = gl.getUniformLocation(p, name);
    }
    return { p, loc };
  }

  /** 名前付きの描画先テクスチャ（サイズが変わったら作り直す） */
  _target(name, w, h, float = false) {
    const gl = this.gl;
    let t = this.targets.get(name);
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const useFloat = float && this.floatRT;
    gl.texImage2D(gl.TEXTURE_2D, 0, useFloat ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
      useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = { tex, fb, w, h };
    this.targets.set(name, t);
    return t;
  }

  _upload(name, data, w, h) {
    const gl = this.gl;
    const t = this._target(name, w, h);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }

  _draw(prog, target, textures, setUniforms) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
    textures.forEach(([uname, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(prog.loc[uname], i);
    });
    setUniforms?.(prog.loc);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _area(src, dstName, w, h) {
    const dst = this._target(dstName, w, h);
    this._draw(this.progs.area, dst, [['src', src]], (loc) => {
      this.gl.uniform2f(loc.scale, src.w / w, src.h / h);
    });
    return dst;
  }

  _blur(src, k, dstName) {
    const { radius, weights } = KERNELS[k];
    const tmp = this._target(`${dstName}_tmp`, src.w, src.h, true);
    const dst = this._target(dstName, src.w, src.h);
    const gl = this.gl;
    const pass = (from, to, dir, quantize) => this._draw(this.progs.blur, to, [['src', from]], (loc) => {
      gl.uniform2i(loc.dir, dir[0], dir[1]);
      gl.uniform1i(loc.radius, radius);
      gl.uniform1fv(loc.weights, weights);
      gl.uniform1i(loc.quantize, quantize ? 1 : 0);
    });
    pass(src, tmp, [1, 0], !this.floatRT);
    pass(tmp, dst, [0, 1], true);
    return dst;
  }

  /**
   * layer（RGBA, 文字グリッド）と orig（RGBA, 元素材）を合成して canvas に描く。
   */
  render(layer, orig, w, h, cfg) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    const layerT = this._upload('layer', layer, w, h);
    const origT = this._upload('orig', orig, w, h);
    const wt = cfg.glow_tight, wm = cfg.glow_mid, wb = cfg.glow_bloom;
    let tight = layerT, mid = layerT, bloom = layerT;
    if (wt || wm || wb) {
      const half = this._area(layerT, 'half', Math.max(1, w >> 1), Math.max(1, h >> 1));
      if (wt) tight = this._blur(half, 9, 'tight');
      if (wm) mid = this._blur(half, 17, 'mid');
      if (wb) {
        const quart = this._area(half, 'quart', Math.max(1, w >> 2), Math.max(1, h >> 2));
        bloom = this._blur(quart, 21, 'bloom');
      }
    }
    const bgr = cfg.canvas_bg;
    const mode = { normal: 0, add: 1, screen: 2 }[cfg.composite_mode] ?? 0;
    this._draw(this.progs.final, null,
      [['layer', layerT], ['orig', origT], ['tightT', tight], ['midT', mid], ['bloomT', bloom]],
      (loc) => {
        gl.uniform3f(loc.wGlow, wt, wm, wb);
        gl.uniform3f(loc.bg, bgr[2], bgr[1], bgr[0]);
        gl.uniform1f(loc.eb, cfg.effect_brightness);
        gl.uniform1f(loc.opacity, cfg.grid_opacity);
        gl.uniform1f(loc.compAlpha, cfg.composite_alpha);
        gl.uniform1i(loc.compMode, mode);
        gl.uniform1i(loc.outH, h);
      });
  }

  /** 描画結果を上から下の行順の RGBA で読み出す */
  readPixels() {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    const buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }
}

// 決定論的な乱数。デスクトップ版（NumPy / Python random）と同じ値を返す。

const U64_MAX_F = 18446744073709551615; // float64 では 2^64 に丸められる（NumPy と同じ）

// ── 64bit 符号なし整数を [hi, lo]（各 uint32）で扱う ─────────────────────────

function mul64(ahi, alo, bhi, blo) {
  // 16bit リムに分割して下位64bitを求める
  const a48 = ahi >>> 16, a32 = ahi & 0xffff, a16 = alo >>> 16, a00 = alo & 0xffff;
  const b48 = bhi >>> 16, b32 = bhi & 0xffff, b16 = blo >>> 16, b00 = blo & 0xffff;
  let c00 = a00 * b00;
  let c16 = c00 >>> 16; c00 &= 0xffff;
  c16 += a16 * b00;
  let c32 = c16 >>> 16; c16 &= 0xffff;
  c16 += a00 * b16;
  c32 += c16 >>> 16; c16 &= 0xffff;
  c32 += a32 * b00;
  let c48 = c32 >>> 16; c32 &= 0xffff;
  c32 += a16 * b16;
  c48 += c32 >>> 16; c32 &= 0xffff;
  c32 += a00 * b32;
  c48 += c32 >>> 16; c32 &= 0xffff;
  c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  c48 &= 0xffff;
  return [((c48 << 16) | c32) >>> 0, ((c16 << 16) | c00) >>> 0];
}

function xorShr(hi, lo, n) {
  // h ^ (h >> n)（0 < n < 32）
  const slo = ((lo >>> n) | (hi << (32 - n))) >>> 0;
  return [(hi ^ (hi >>> n)) >>> 0, (lo ^ slo) >>> 0];
}

function mix(hi, lo) {
  let h = xorShr(hi, lo, 30);
  h = mul64(h[0], h[1], 0xbf58476d, 0x1ce4e5b9);
  h = xorShr(h[0], h[1], 27);
  h = mul64(h[0], h[1], 0x94d049bb, 0x133111eb);
  return xorShr(h[0], h[1], 31);
}

const toUnit = (hi, lo) => (hi * 4294967296 + lo) / U64_MAX_F;

/** visualizer._vec_hash2 と同じ splitmix64 で [0,1) の乱数を2つ返す。seed は 0 ≤ seed < 2^53 の整数。 */
export function hash2(seed) {
  const hi = Math.floor(seed / 4294967296) >>> 0;
  const lo = seed >>> 0;
  const h1 = mix(hi, lo);
  // s2 = h1 + 0x9E3779B97F4A7C15
  let slo = h1[1] + 0x7f4a7c15;
  const carry = slo > 0xffffffff ? 1 : 0;
  slo >>>= 0;
  const shi = (h1[0] + 0x9e3779b9 + carry) >>> 0;
  const h2 = mix(shi, slo);
  return [toUnit(h1[0], h1[1]), toUnit(h2[0], h2[1])];
}

// ── Python random.Random(seed).random() の再現（MT19937） ────────────────────

/** random.Random(seed).random() の最初の値（seed は非負整数）。 */
export function pyRandomFirst(seed) {
  const mt = new Uint32Array(624);
  mt[0] = 19650218;
  for (let i = 1; i < 624; i++) {
    const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
    mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
  }
  const key = seed === 0 ? [0] : [];
  for (let n = seed; n > 0; n = Math.floor(n / 4294967296)) key.push(n % 4294967296);
  let i = 1, j = 0;
  for (let k = Math.max(624, key.length); k; k--) {
    const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
    mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
    i++; j++;
    if (i >= 624) { mt[0] = mt[623]; i = 1; }
    if (j >= key.length) j = 0;
  }
  for (let k = 623; k; k--) {
    const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
    mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
    i++;
    if (i >= 624) { mt[0] = mt[623]; i = 1; }
  }
  mt[0] = 0x80000000;
  // 最初の624語を生成して先頭2語を使う
  for (let k = 0; k < 624; k++) {
    const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
    mt[k] = (mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
  }
  const temper = (y) => {
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  const a = temper(mt[0]) >>> 5;
  const b = temper(mt[1]) >>> 6;
  return (a * 67108864 + b) / 9007199254740992;
}

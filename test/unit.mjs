// node test/unit.mjs — 乱数・色変換がデスクトップ版と一致するか検証する
import { readFileSync } from 'node:fs';
import { hash2, pyRandomFirst } from '../src/random.js';
import { bgr2hsv, shiftHue } from '../src/color.js';

const exp = JSON.parse(readFileSync(new URL('./unit_expected.json', import.meta.url)));
let fail = 0;
const check = (name, ok, detail) => { if (!ok) { fail++; console.log('FAIL', name, detail); } };

for (const [s, a, b] of exp.hash2) {
  const [x, y] = hash2(s);
  check(`hash2(${s})`, x === a && y === b, [x, y, a, b]);
}
for (const [s, v] of exp.pyRandom) {
  const x = pyRandomFirst(s);
  check(`pyRandom(${s})`, x === v, [x, v]);
}
for (const [c, v] of exp.bgr2hsv) {
  const x = bgr2hsv(c[0], c[1], c[2], [0, 0, 0]);
  check(`bgr2hsv(${c})`, x.every((n, i) => n === v[i]), [x, v]);
}
for (const [c, s, v] of exp.shiftHue) {
  const x = shiftHue(c, s);
  check(`shiftHue(${c},${s})`, x.every((n, i) => n === v[i]), [x, v]);
}
const total = exp.hash2.length + exp.pyRandom.length + exp.bgr2hsv.length + exp.shiftHue.length;
console.log(`${total - fail}/${total} passed`);
process.exit(fail ? 1 : 0);

// 素材がなくても動きを見せるためのサンプル映像（暗い背景の人型が手を振る）

export class SampleScene {
  constructor(w = 1280, h = 720) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  draw(t) {
    const { ctx } = this;
    const w = this.width, h = this.height;
    ctx.fillStyle = '#050605';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5 + Math.sin(t * 0.35) * w * 0.06;
    const sway = Math.sin(t * 0.9) * 0.05;
    ctx.save();
    ctx.translate(cx, h * 0.98);
    ctx.rotate(sway);

    // 斜めの光で明暗をつける（文字の濃淡になる）
    const light = ctx.createLinearGradient(-w * 0.2, -h * 0.9, w * 0.2, 0);
    light.addColorStop(0, '#f4e7c8');
    light.addColorStop(0.55, '#b98f6a');
    light.addColorStop(1, '#3a2f2a');
    ctx.fillStyle = light;
    ctx.strokeStyle = light;
    ctx.lineCap = 'round';

    // 胴
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.33, w * 0.105, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // 頭
    ctx.beginPath();
    ctx.arc(Math.sin(t * 1.3) * 6, -h * 0.74, h * 0.105, 0, Math.PI * 2);
    ctx.fill();
    // 左腕（下げる）
    ctx.lineWidth = h * 0.055;
    ctx.beginPath();
    ctx.moveTo(-w * 0.075, -h * 0.55);
    ctx.lineTo(-w * 0.15, -h * 0.25 + Math.sin(t * 0.8) * 10);
    ctx.stroke();
    // 右腕（手を振る）
    const a = -1.1 + Math.sin(t * 3.2) * 0.45;
    const sx = w * 0.075, sy = -h * 0.55;
    const ex = sx + Math.cos(a) * h * 0.2, ey = sy + Math.sin(a) * h * 0.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex + Math.cos(a - 0.6) * h * 0.17, ey + Math.sin(a - 0.6) * h * 0.17);
    ctx.stroke();
    ctx.restore();

    // ゆっくり漂う光の粒
    for (let i = 0; i < 5; i++) {
      const p = (t * 0.04 + i / 5) % 1;
      const x = w * (0.08 + 0.84 * ((i * 0.37 + p) % 1));
      const y = h * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.5 + i * 1.7)));
      const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.06);
      g.addColorStop(0, 'rgba(160, 220, 255, 0.9)');
      g.addColorStop(1, 'rgba(160, 220, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - h * 0.06, y - h * 0.06, h * 0.12, h * 0.12);
    }
  }
}

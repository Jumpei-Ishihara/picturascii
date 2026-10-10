# PICTURASCII

Turn the subject of a picture, video, or camera feed into living ASCII.
Everything runs in the browser — no uploads, no server.

> Status: **W0** — the rendering core is ported from the desktop app
> (AI Object Detection Visualizer, Python/OpenCV) to JavaScript + WebGL2
> and verified against it. The public web UI is the next step (W1).

## How it works

| Stage | Where | Port of (desktop `visualizer.py`) |
|---|---|---|
| Subject mask — FULL / AUTO / CHROMA | CPU (`src/detect.js`) | `detect_silhouette`, `_mask_chroma_bg`, `_postprocess_mask` |
| Character grid, density mapping, deterministic animation | CPU (`src/grid.js`) | `draw_silhouette_grid` |
| 3-scale glow, background, opacity, blend modes | GPU (`src/gl.js`) | `_multi_glow`, `process_frame`, `_composite` |

Glyphs are the desktop app's Hershey Duplex tiles, exported once per character
(`assets/glyphs/`), so the web version draws the same letterforms.
Random values (splitmix64 hashes, Python's MT19937) are reproduced bit-for-bit.

## Development

Serve the folder with any static server, e.g.

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

### Tests

```bash
node test/unit.mjs
```

Checks hashes, Python `random`, and OpenCV HSV conversion against values
exported from the desktop app (`test/unit_expected.json`).

Open `http://127.0.0.1:8765/test/compare.html` to render every case in
`test/cases.json` and compare it with the desktop output in `test/reference/`.
A case passes at PSNR ≥ 30 dB with fewer than 1% of pixels off by more than 32.

### Regenerating assets (needs the desktop repo and its Python env)

```bash
python tools/gen_atlas.py        --desktop-repo <path>   # assets/glyphs*
python tools/gen_test_images.py                           # test/fixtures (synthetic)
python tools/gen_reference.py    --desktop-repo <path>   # test/reference
python tools/gen_unit_expected.py --desktop-repo <path>  # test/unit_expected.json
```

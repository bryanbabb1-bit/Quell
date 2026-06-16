// Reskin the Members black+gold app art to the Ignite brand WITHOUT redrawing it:
// remap every pixel by luminance between the orange field and a white mark. The
// dark background (+ the golf-ball hole) becomes orange; the gold mark becomes
// white; anti-aliased edges blend smoothly. Strava-style: orange field, white mark.
//
//   cd api && node scripts/reskin_icon.mjs
// Outputs to app/assets/_ignite/ for review; promote by copying over the originals.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import pngjs from 'pngjs';
const { PNG } = pngjs;

const ORANGE = [242, 84, 45];   // #F2542D — Ignite accent
const WHITE = [255, 255, 255];  // the mark
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function reskin(inPath, outPath) {
  const png = PNG.sync.read(readFileSync(inPath));
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const t = smooth(40, 85, lum); // bg/hole → 0 (orange); gold mark → 1 (white)
    d[i] = Math.round(ORANGE[0] + (WHITE[0] - ORANGE[0]) * t);
    d[i + 1] = Math.round(ORANGE[1] + (WHITE[1] - ORANGE[1]) * t);
    d[i + 2] = Math.round(ORANGE[2] + (WHITE[2] - ORANGE[2]) * t);
    // alpha (d[i+3]) preserved
  }
  writeFileSync(outPath, PNG.sync.write(png));
  console.error(`reskinned ${inPath} -> ${outPath} (${png.width}x${png.height})`);
}

const A = '../app/assets';
mkdirSync(`${A}/_ignite`, { recursive: true });
for (const f of ['icon.png', 'splash.png', 'adaptive-icon.png']) reskin(`${A}/${f}`, `${A}/_ignite/${f}`);

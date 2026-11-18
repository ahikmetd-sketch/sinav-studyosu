/* Okuyucu (src/omr.js) regresyon testleri.
 * tests/fixtures içindeki fotoğraflar okunur ve tests/fixtures/expected.json ile karşılaştırılır.
 * Yeni beklenen değerleri yazmak için:  node tests/omr.test.js --update
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const OMR = require('../src/omr.js');

const DIR = path.join(__dirname, 'fixtures');
const CASES = [
  { file: 'sc1.jpg', N: 6, Q: 20, booklet: false, note: 'tek kitapçık, 4. soruda çift işaret, 8. soruda silinmiş iz' },
  { file: 'cls0.jpg', N: 6, Q: 20, booklet: false, note: 'tek kitapçık, temiz kağıt' },
  { file: 'cls1.jpg', N: 6, Q: 20, booklet: false, note: 'tek kitapçık, temiz kağıt' },
  { file: 'smpphoto1.jpg', N: 6, Q: 20, booklet: false, note: 'örnek dolu kağıdın eğik fotoğrafı' },
  { file: 'scA.jpg', N: 6, Q: 20, booklet: true, note: 'A kitapçığı' },
  { file: 'scB.jpg', N: 6, Q: 20, booklet: true, note: 'B kitapçığı (şıklar karışık)' },
  { file: 'scA.jpg', N: 6, Q: 20, booklet: false, id: 'scA-yanlis-ayar', note: 'kitapçıklı formu kitapçıksız ayarla okuma: reddedilmeli' },
  { file: 'sc1.jpg', N: 6, Q: 25, booklet: false, id: 'sc1-yanlis-soru', note: 'yanlış soru sayısı: reddedilmeli' }
];

function decode(file) {
  const img = jpeg.decode(fs.readFileSync(path.join(DIR, file)), { useTArray: true, formatAsRGBA: true });
  // uygulama okumadan önce uzun kenarı 1800 piksele indirir; aynı ölçeği burada en yakın komşu ile uygula
  const s = Math.min(1, 1800 / Math.max(img.width, img.height));
  if (s === 1) return img;
  const w = Math.round(img.width * s), h = Math.round(img.height * s), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(img.width - 1, Math.floor(x / s)), sy = Math.min(img.height - 1, Math.floor(y / s));
    out.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4);
  }
  return { width: w, height: h, data: out };
}
function summarize(r) {
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    no: r.digits.map(d => (d.v >= 0 ? String(d.v) : d.v === -2 ? '?' : '_')).join(''),
    bk: r.booklet ? (r.booklet.v === 0 ? 'A' : r.booklet.v === 1 ? 'B' : '?') : '',
    ans: r.answers.map(a => (a.v >= 0 ? 'ABCDE'[a.v] : a.v === -1 ? '.' : '*')).join(''),
    flags: r.answers.map((a, q) => (a.flag ? q + 1 : 0)).filter(Boolean)
  };
}

const expFile = path.join(DIR, 'expected.json');
const update = process.argv.includes('--update');
const expected = !update && fs.existsSync(expFile) ? JSON.parse(fs.readFileSync(expFile, 'utf8')) : {};
let fail = 0;
const got = {};
for (const c of CASES) {
  const id = c.id || c.file.replace(/\.jpg$/, '');
  const img = decode(c.file);
  const t0 = Date.now();
  const r = summarize(OMR.read(img.data, img.width, img.height, c.N, c.Q, c.booklet));
  const ms = Date.now() - t0;
  got[id] = r;
  if (update) { console.log('yazıldı', id, JSON.stringify(r)); continue; }
  const e = expected[id];
  const ok = e && JSON.stringify(e) === JSON.stringify(r);
  if (!ok) fail++;
  console.log((ok ? 'GEÇTİ ' : 'KALDI ') + id.padEnd(16) + ' ' + String(ms).padStart(4) + ' ms  ' + c.note + (ok ? '' : '\n   beklenen: ' + JSON.stringify(e) + '\n   okunan:   ' + JSON.stringify(r)));
}
if (update) { fs.writeFileSync(expFile, JSON.stringify(got, null, 2) + '\n'); process.exit(0); }
console.log(fail ? fail + ' test kaldı.' : 'Bütün testler geçti.');
process.exit(fail ? 1 : 0);

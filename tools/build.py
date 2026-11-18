"""Sınav Stüdyosu derleme betiği.

Üretir:
  dist/                         telefona kurulabilen, internetsiz çalışan PWA (GitHub Pages'e bu klasör yüklenir)
  dist-claude/sinav-studyosu-claude.html   Claude içindeki yayın için tek dosya (kütüphaneler CDN'den)

Kullanım:  npm ci && npm run build
Gerekenler: Python 3 (yalnızca standart kütüphane) ve npm ile kurulan kütüphaneler (node_modules).
"""
import os, re, json, hashlib, glob, shutil, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
NM = os.path.join(ROOT, 'node_modules')
OUT = os.path.join(ROOT, 'dist')
OUTC = os.path.join(ROOT, 'dist-claude')

def rd(*p): return open(os.path.join(*p), encoding='utf-8').read()

for d in (OUT, OUTC):
    shutil.rmtree(d, ignore_errors=True)
os.makedirs(OUT); os.makedirs(OUTC)

# ---------- ortak çekirdek parçaları ----------
fonts_js = 'const FONTS = ' + json.dumps({k: base64.b64encode(open(os.path.join(ROOT, 'assets/fonts/lm', k + '.ttf'), 'rb').read()).decode()
                                          for k in ['rm', 'rmb', 'rmi', 'sf', 'sfb']}) + ';\n'
optik_js = 'const OPTIK_TEX = ' + json.dumps(rd(SRC, 'latex/optik_form.tex')) + ';\n'
omr_js = rd(SRC, 'omr.js').replace("if (typeof module !== 'undefined') module.exports = OMR;", '')
studio_cdn = rd(SRC, 'studio.js')
app_src = rd(SRC, 'app.html')

# ---------- 1) Claude sürümü ----------
open(os.path.join(OUTC, 'sinav-studyosu-claude.html'), 'w', encoding='utf-8').write(
    app_src.replace('/*OMR*/', omr_js + '\n' + fonts_js + '\n' + optik_js + '\n' + studio_cdn))

# ---------- 2) PWA ----------
s = app_src


def R(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, ('count', s.count(a), a[:100])
    s = s.replace(a, b)


# ---------- head ----------
R('''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;700&display=swap" rel="stylesheet">''',
  '''<link rel="stylesheet" href="fonts/fonts.css">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#E6E9ED" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111316" media="(prefers-color-scheme: dark)">
<meta name="description" content="Optik formlu çoktan seçmeli sınav hazırlama, PDF basma ve telefon kamerasıyla okuma.">
<link rel="icon" type="image/png" href="icons/favicon-64.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Sınav Stüdyosu">
<meta name="apple-mobile-web-app-status-bar-style" content="default">''')
R('#toast.show{opacity:1}', '''#toast.show{opacity:1}
.updbar{position:fixed;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));z-index:70;display:flex;gap:12px;align-items:center;
  background:var(--paper);border:1.5px solid var(--blue);border-radius:12px;padding:8px 10px 8px 14px;box-shadow:0 6px 18px -8px rgba(0,0,0,.4)}''')

# ---------- depolama: Claude db yerine IndexedDB ----------
i0 = s.index('/* ---------------- depolama ---------------- */')
i1 = s.index('function dbErrMsg(e) {')
s = s[:i0] + rd(SRC, 'pwa/store.js') + '\n' + s[i1:]
R("""  if (c === 'quota_exceeded') return 'Depolama alanı doldu. Eski bir sınavı silip yeniden deneyin.';""",
  """  if (c === 'quota_exceeded' || (e && e.name === 'QuotaExceededError')) return 'Cihazdaki depolama alanı doldu. Yedek alıp eski bir sınavı silin.';""")
R("""  if (store.mode === 'mem' && app.storeReady) note = 'Bu görünümde kayıt yok: sayfa kapanınca sonuçlar silinir.';""",
  """  if (store.mode === 'mem' && app.storeReady) note = 'Tarayıcı kayıt izni vermedi (gizli sekme olabilir): sayfa kapanınca veriler silinir.';""")

# ---------- dosya kaydetme ----------
i0 = s.index('async function saveFile(name, blob) {')
i1 = s.index('\n}\n', i0) + 3
s = s[:i0] + rd(SRC, 'pwa/extra.js') + '\n' + s[i1:]
R("""  if (!app.downloads && !app.topLevel) { toast('Bu görünümde dosya indirme kullanılamıyor.'); return; }\n""", '')
R("s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';", "s.src = 'lib/xlsx.full.min.js';")

# ---------- sınav listesi: yedek + kurulum ----------
s = re.sub(r'/\*CLAUDE-ONLY-START\*/.*?/\*CLAUDE-ONLY-END\*/\n', '', s, flags=re.S)
R("""    '<div class="actions"><button class="btn primary" data-act="create">Sınavı oluştur</button></div>';
}
function opts(""", """    '<div class="actions"><button class="btn primary" data-act="create">Sınavı oluştur</button></div>' +
    '<h2>Yedeğiniz var mı?</h2><p class="small muted">Başka bir cihazdan ya da Claude’daki sürümden aldığınız yedek dosyasını açarak sınavlarınızı buraya taşıyın.</p>' +
    '<button class="btn" data-act="restore">Yedekten geri yükle</button>' + installBlock();
}
function opts(""")
R("""    '<div class="actions"><button class="btn primary" data-act="create">Sınavı oluştur</button></div>';
  h += claudeExportBlock();
  openSheet('exams', h);""", """    '<div class="actions"><button class="btn primary" data-act="create">Sınavı oluştur</button></div>';
  h += '<h2>Yedek</h2><p class="small muted">Veriler yalnızca bu cihazda duruyor. Düzenli yedek alın; yedek dosyasıyla başka bir cihaza da taşıyabilirsiniz. Geri yüklemede aynı sınavlar yedektekiyle değiştirilir. ' + backupInfo() + '</p>' +
    '<div class="row"><button class="btn" data-act="backup">Yedeği indir</button><button class="btn" data-act="restore">Yedekten geri yükle</button></div>';
  h += installBlock();
  openSheet('exams', h);""")
# sonuçlarda yedek hatırlatması
R("""  if (keyMissing) h += '<p class="warn">Cevap anahtarı eksik; taralı kutular puana katılmadı. Sınav sekmesinden tamamlayın.</p>';""",
  """  if (keyMissing) h += '<p class="warn">Cevap anahtarı eksik; taralı kutular puana katılmadı. Sınav sekmesinden tamamlayın.</p>';
  if (ls.get('omr.dirty') === '1') h += '<p class="warn">Son yedekten sonra yeni kağıt okundu; veriler yalnızca bu cihazda. <button class="btn ghost sm" data-act="backup">Yedeği indir</button></p>';""")

# ---------- olaylar ----------
R("""    case 'out': runOut(t.dataset.v, t.dataset.b || ''); break;""", """    case 'out': runOut(t.dataset.v, t.dataset.b || ''); break;
    case 'dosave': doSave(); break;
    case 'backup': doBackup(); break;
    case 'restore': $('#bakIn').click(); break;
    case 'install': if (installEvt) { installEvt.prompt(); installEvt = null; closeSheet(); } break;
    case 'reload': location.reload(); break;""")
R("""  if (t.id === 'texIn') {""", """  if (t.id === 'bakIn') { const f = t.files && t.files[0]; t.value = ''; if (f) doRestore(f); return; }
  if (t.id === 'texIn') {""")
R('<input type="file" id="texIn" hidden>', '<input type="file" id="texIn" hidden>\n<input type="file" id="bakIn" accept=".json,application/json" hidden>')
R("""app.topLevel = !window.claude""" if "app.topLevel = !window.claude" in s else "topLevel: !window.claude", "topLevel: true")

# ---------- çekirdek: yerel kütüphane yolları ----------
studio = studio_cdn
for a, b in [
    ("mj: 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-svg.js',", "mj: 'lib/mathjax/tex-svg.js',"),
    ("mjfont: 'https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.1.3',", "mjfont: new URL('lib/mathjax-newcm-font', location.href).href,"),
    ("jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',", "jspdf: 'lib/jspdf.umd.min.js',"),
    ("svg2pdf: 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js',", "svg2pdf: 'lib/svg2pdf.umd.min.js',"),
    ("jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'", "jszip: 'lib/jszip.min.js'"),
]:
    assert studio.count(a) == 1, a
    studio = studio.replace(a, b)
core = omr_js + '\n' + fonts_js + '\n' + optik_js + '\n' + studio
html = s.replace('/*OMR*/', core)
assert 'https://' not in re.sub(r'https://(claude\.ai|www\.w3\.org)[^"\' ]*', '', html.split('<script>')[0]), 'harici bağlantı kaldı (head)'
open(OUT + '/index.html', 'w', encoding='utf-8').write(html)

# ---------- kütüphaneler, yazı tipleri, simgeler ----------
def cp(a, b):
    os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(a, b)
cp(os.path.join(NM, 'mathjax/tex-svg.js'), OUT + '/lib/mathjax/tex-svg.js')
cp(os.path.join(NM, 'mathjax/LICENSE'), OUT + '/lib/mathjax/LICENSE')
for sub in ('input', 'output', 'ui'):
    shutil.copytree(os.path.join(NM, 'mathjax', sub), OUT + '/lib/mathjax/' + sub)
skip = re.compile(r'^(cyrillic|hebrew|arabic|devanagari|cherokee|braille|phonetics)')
for f in glob.glob(os.path.join(NM, '@mathjax/mathjax-newcm-font/svg/dynamic/*.js')):
    if not skip.match(os.path.basename(f)):
        cp(f, OUT + '/lib/mathjax-newcm-font/svg/dynamic/' + os.path.basename(f))
cp(os.path.join(NM, 'mathjax/LICENSE'), OUT + '/lib/mathjax-newcm-font/LICENSE')
cp(os.path.join(NM, 'jspdf/dist/jspdf.umd.min.js'), OUT + '/lib/jspdf.umd.min.js')
cp(os.path.join(NM, 'svg2pdf.js/dist/svg2pdf.umd.min.js'), OUT + '/lib/svg2pdf.umd.min.js')
cp(os.path.join(NM, 'jszip/dist/jszip.min.js'), OUT + '/lib/jszip.min.js')
cp(os.path.join(NM, 'xlsx/dist/xlsx.full.min.js'), OUT + '/lib/xlsx.full.min.js')
FS = os.path.join(NM, '@fontsource/fira-sans')
css = ''
for w in ('400', '500', '700'):
    for block in re.findall(r'/\*[^*]*\*/\s*@font-face\s*\{[^}]*\}', rd(FS, w + '.css')):
        m = re.search(r'fira-sans-([a-z-]+)-' + w + r'-normal\.woff2', block)
        if not m or m.group(1) not in ('latin', 'latin-ext'): continue
        fn = 'fira-sans-%s-%s-normal.woff2' % (m.group(1), w)
        cp(os.path.join(FS, 'files', fn), OUT + '/fonts/' + fn)
        b = re.sub(r'url\(\./files/(fira-sans-[^)]+\.woff2)\)', r'url(\1)', block)
        css += re.sub(r',\s*url\([^)]*\.woff\)\s*format\([^)]*\)', '', b) + '\n'
open(OUT + '/fonts/fonts.css', 'w', encoding='utf-8').write(css)
for f in glob.glob(os.path.join(ROOT, 'assets/icons/*.png')):
    cp(f, OUT + '/icons/' + os.path.basename(f))
cp(os.path.join(ROOT, 'THIRD_PARTY_LICENSES.md'), OUT + '/LISANSLAR.md')

# ---------- manifest ----------
manifest = {
    "name": "Sınav Stüdyosu", "short_name": "Sınav", "lang": "tr", "dir": "ltr",
    "description": "Optik formlu çoktan seçmeli sınav hazırlama, PDF basma ve telefon kamerasıyla okuma.",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
    "background_color": "#E6E9ED", "theme_color": "#2443C4",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}
json.dump(manifest, open(OUT + '/manifest.webmanifest', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# ---------- service worker ----------
def rel(p): return os.path.relpath(p, OUT).replace(os.sep, '/')
common_dyn = ['calligraphic', 'double-struck', 'fraktur', 'script', 'latin', 'math', 'monospace', 'sans-serif',
              'arrows', 'marrows', 'symbols', 'shapes', 'mshapes', 'accents', 'variants']
precache = ['./', 'index.html', 'manifest.webmanifest', 'fonts/fonts.css'] + \
    sorted(rel(p) for p in glob.glob(OUT + '/fonts/*.woff2')) + \
    sorted(rel(p) for p in glob.glob(OUT + '/icons/*.png')) + \
    ['lib/jspdf.umd.min.js', 'lib/svg2pdf.umd.min.js', 'lib/jszip.min.js', 'lib/xlsx.full.min.js', 'lib/mathjax/tex-svg.js'] + \
    sorted(rel(p) for p in glob.glob(OUT + '/lib/mathjax/input/**/*.js', recursive=True)) + \
    ['lib/mathjax-newcm-font/svg/dynamic/%s.js' % n for n in common_dyn if os.path.exists(OUT + '/lib/mathjax-newcm-font/svg/dynamic/%s.js' % n)]
h = hashlib.sha256()
for p in sorted(glob.glob(OUT + '/**/*', recursive=True)):
    if os.path.isfile(p) and not p.endswith('sw.js'):
        h.update(rel(p).encode()); h.update(open(p, 'rb').read())
version = 'ss-' + h.hexdigest()[:12]
sw = '''/* Sınav Stüdyosu — çevrimdışı önbellek */
const VERSION = %s;
const PRECACHE = %s;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
''' % (json.dumps(version), json.dumps(precache, ensure_ascii=False, indent=0))
open(OUT + '/sw.js', 'w', encoding='utf-8').write(sw)
tot = sum(os.path.getsize(OUT + '/' + (p if p != './' else 'index.html')) for p in precache)
print('Claude sürümü:', os.path.relpath(OUTC, ROOT) + '/sinav-studyosu-claude.html')
print('PWA:', os.path.relpath(OUT, ROOT) + '/', '| sürüm', version, '| önbellek', len(precache), 'dosya,', round(tot / 1e6, 1), 'MB')

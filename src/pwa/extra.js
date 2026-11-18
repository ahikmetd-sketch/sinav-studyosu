/* ---------------- dosya kaydetme (paylaş / indir) ---------------- */
const isTouch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function anchorSave(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function saveFile(name, blob) {
  let file = null;
  try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (e) {}
  if (isTouch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) {
      if (e && e.name === 'AbortError') return false;
      app.pendingFile = { name, blob, file };
      openSheet('save', sheetHead('Dosya hazır') + '<p>' + esc(name) + '</p><p class="small muted">Paylaş menüsünden Dosyalar’a kaydedebilir, e-postayla ya da yazıcıya gönderebilirsiniz.</p>' +
        '<div class="actions"><button class="btn primary" data-act="dosave">Paylaş ya da kaydet</button></div>');
      return true;
    }
  }
  anchorSave(name, blob);
  toast(name + ' indirildi.');
  return true;
}
async function doSave() {
  const f = app.pendingFile; app.pendingFile = null; closeSheet();
  if (!f) return;
  try { await navigator.share({ files: [f.file], title: f.name }); }
  catch (e) { if (!e || e.name !== 'AbortError') anchorSave(f.name, f.blob); }
}

/* ---------------- yedek ---------------- */
function backupInfo() {
  const last = ls.get('omr.lastBackup');
  return last ? 'Son yedek: ' + new Date(last).toLocaleString('tr-TR') + '.' : 'Henüz yedek alınmadı.';
}
async function doBackup() {
  try {
    const data = await store.exportAll();
    const d = new Date();
    const name = 'sinav-studyosu-yedek-' + d.toISOString().slice(0, 10) + '.json';
    const ok = await saveFile(name, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    if (ok) { ls.set('omr.lastBackup', d.toISOString()); ls.set('omr.dirty', '0'); renderResults(); }
  } catch (e) { toast('Yedek alınamadı (' + (e && e.message || e) + ').'); }
}
async function doRestore(f) {
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast('Dosya okunamadı; Sınav Stüdyosu yedeği mi?'); return; }
  if (!data || data.app !== 'sinav-studyosu') { toast('Bu dosya bir Sınav Stüdyosu yedeği değil.'); return; }
  try {
    const n = await store.importAll(data);
    closeSheet();
    toast(n.exams + ' sınav ve ' + n.results + ' kağıt geri yüklendi.');
  } catch (e) { toast('Geri yükleme yapılamadı (' + (e && e.message || e) + ').'); }
}

/* ---------------- kurulum ve güncelleme ---------------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function installBlock() {
  if (isStandalone()) return '';
  let h = '<h2>Ana ekrana ekle</h2>';
  if (installEvt) h += '<p class="small muted">Uygulama telefonunuza simgesiyle kurulur ve internetsiz de çalışır.</p><button class="btn primary" data-act="install">Uygulamayı yükle</button>';
  else if (isIOS) h += '<p class="small muted">Safari’de alttaki paylaş düğmesine dokunup “Ana Ekrana Ekle”yi seçin. Uygulama kendi simgesiyle açılır ve internetsiz de çalışır.</p>';
  else h += '<p class="small muted">Tarayıcı menüsünden “Uygulamayı yükle” ya da “Ana ekrana ekle”yi seçin. Uygulama kendi simgesiyle açılır ve internetsiz de çalışır.</p>';
  return h;
}
function showUpdate() {
  const b = document.createElement('div');
  b.className = 'updbar';
  b.innerHTML = '<span>Yeni sürüm hazır.</span><button class="btn sm primary" data-act="reload">Yenile</button>';
  document.body.appendChild(b);
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); });
      });
    }).catch(() => {});
  });
}

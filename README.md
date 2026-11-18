# Sınav Stüdyosu

Optik formlu çoktan seçmeli sınavlar için uçtan uca bir araç:

- **Sınav hazırlama:** başlık ve sorular (`$...$` ile LaTeX matematik), canlı önizleme, exam sınıfındaki `.tex` dosyalarını içe aktarma
- **Çıktı:** telefonda PDF üretimi (Latin Modern + MathJax 4 / New Computer Modern), ayrıca LaTeX (`.zip`) dışa aktarma
- **A/B kitapçık:** soruları (isteğe bağlı şıkları) karıştırır, B anahtarını kendisi hesaplar; kitapçık harfi formda basılı gelir
- **Optik okuma:** telefon kamerasıyla çekilen formu okur; çift işaret, silik işaret ve okunamayan numarayı kontrol için işaretler; form ayarlarıyla uyuşmayan kağıdı reddeder
- **Sonuçlar:** not tablosu, madde analizi (güçlük, ayırt edicilik, çeldirici analizi, KR-20), Excel'e aktarma
- **Veriler cihazda:** sunucu yok; yedek dosyasıyla taşınır

Uygulama tek bir HTML sayfasıdır; telefona PWA olarak kurulur ve internetsiz çalışır.

## Klasör yapısı

```
src/
  app.html          arayüz (Claude ve PWA sürümlerinin ortak kaynağı)
  omr.js            optik okuyucu çekirdeği (saf JS; tarayıcı ve Node)
  studio.js         dizgi motoru: zengin metin → sayfa düzeni → PDF/SVG; .tex içe/dışa aktarma
  pwa/store.js      PWA depolaması (IndexedDB), yedek alma/geri yükleme
  pwa/extra.js      dosya paylaşma/indirme, kurulum, güncelleme uyarısı
  latex/optik_form.tex  LaTeX optik form makrosu (omr.js ile aynı geometri)
assets/
  fonts/lm/         PDF'e gömülen Latin Modern alt kümeleri (tools/make_fonts.py ile üretilir)
  icons/            uygulama simgeleri
tools/
  build.py          derleme: dist/ (PWA) ve dist-claude/ (Claude sürümü)
  make_fonts.py     Latin Modern OTF → alt kümelenmiş TTF
  gen_sheet.py      test için sentetik doldurulmuş form fotoğrafı üretici (OpenCV gerekir)
tests/
  omr.test.js       okuyucu regresyon testleri
  fixtures/         test fotoğrafları ve beklenen sonuçlar
.github/workflows/pages.yml   her push'ta test, derleme ve GitHub Pages yayını
```

## Geliştirme

Gerekenler: Node.js 20+ ve Python 3.

```bash
npm ci            # kütüphaneleri sabit sürümleriyle kurar
npm test          # okuyucu testleri
npm run build     # dist/ ve dist-claude/ üretir
npm run serve     # http://localhost:8080 adresinde dist/'i sunar
```

Okuyucuda bilerek bir davranış değişikliği yaptıysanız beklenen değerleri `node tests/omr.test.js --update` ile yenileyin ve farkı gözden geçirin.

## Yayın (GitHub Pages)

1. Depoyu GitHub'a yükleyin.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** seçin.
3. `main` dalına her gönderimde testler çalışır, uygulama derlenir ve `https://<kullanıcı>.github.io/<depo>/` adresinde yayınlanır.
4. Kullanıcılar uygulamayı bir sonraki açışlarında "Yeni sürüm hazır → Yenile" uyarısı görür; verileri korunur.

Claude içindeki sürüm için derlenen dosya, Actions çalışmasının **claude-surumu** çıktısında (`dist-claude/sinav-studyosu-claude.html`) bulunur.

## Önemli: form geometrisi

Optik formun ölçüleri üç yerde birebir aynı olmalıdır: `src/omr.js` içindeki `layout()`, `src/studio.js` içindeki `formItems()` ve `src/latex/optik_form.tex`. Birini değiştirirseniz diğerlerini de değiştirin ve testleri çalıştırın; aksi hâlde basılmış formlar okunamaz.

## Veriler ve gizlilik

Öğrenci numaraları ve notlar yalnızca kullanıcının cihazındaki tarayıcı veritabanında tutulur; hiçbir sunucuya gönderilmez. GitHub Pages yalnızca uygulamanın dosyalarını sunar.

## Lisans

Projenin kendi lisansı henüz seçilmedi. Üçüncü taraf bileşenlerin lisansları için `THIRD_PARTY_LICENSES.md` dosyasına bakın.

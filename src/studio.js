/* Sınav dizgi motoru: zengin metin → sayfa düzeni → PDF / SVG önizleme; .tex içe/dışa aktarma */
const Studio = (function () {
  'use strict';
  const PT = 25.4 / 72;
  const PG = { w: 210, h: 297, ml: 10, mr: 10, top: 16, bottom: 284 };
  const TW = PG.w - PG.ml - PG.mr;
  const FS = 11, BL = 5.9, LBL = 8.5;
  const URLS = {
    mj: 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-svg.js',
    mjfont: 'https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.1.3',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    svg2pdf: 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  };
  const DEFAULT_NOTE = 'Not: Yukarıdaki optik forma işaretlenmeyen cevaplar doğru kabul edilmeyecektir.';

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error(src));
      document.head.appendChild(s);
    });
  }
  let ready = null, mdoc = null, isReady = false;
  function ensure() {
    if (ready) return ready;
    if (!window.MathJax || !window.MathJax.tex2svg)
      window.MathJax = {
        startup: { typeset: false },
        svg: { fontCache: 'none', linebreaks: { inline: false } },
        output: { fontPath: URLS.mjfont },
        options: { enableMenu: false, menuOptions: { settings: { enrich: false, speech: false, braille: false, collapsible: false, assistiveMml: false } } }
      };
    ready = Promise.all([
      (window.MathJax.tex2svg ? Promise.resolve() : loadScript(URLS.mj)).then(() => window.MathJax.startup.promise),
      (window.jspdf ? Promise.resolve() : loadScript(URLS.jspdf)).then(() => window.jspdf.jsPDF.API.svg ? null : loadScript(URLS.svg2pdf))
    ]).then(() => { mdoc = newDoc(); loadFaces(); isReady = true; });
    ready.catch(() => { ready = null; });
    return ready;
  }
  function newDoc() {
    const d = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (const k in FONTS) { d.addFileToVFS(k + '.ttf', FONTS[k]); d.addFont(k + '.ttf', k, 'normal'); }
    d.setFont('rm');
    return d;
  }
  let facesDone = false;
  function loadFaces() {
    if (facesDone || !window.FontFace) return; facesDone = true;
    const D = { rm: ['LMRoman', {}], rmb: ['LMRoman', { weight: '700' }], rmi: ['LMRoman', { style: 'italic' }], sf: ['LMSans', {}], sfb: ['LMSans', { weight: '700' }] };
    for (const k in FONTS) {
      try {
        const bin = Uint8Array.from(atob(FONTS[k]), c => c.charCodeAt(0));
        new FontFace(D[k][0], bin.buffer, D[k][1]).load().then(f => document.fonts.add(f)).catch(() => {});
      } catch (e) {}
    }
  }

  /* ---------- ölçüm ---------- */
  const wc = new Map();
  function tw(s, f, pt) {
    const key = f + '\u0000' + s;
    let u = wc.get(key);
    if (u == null) { mdoc.setFont(f); u = mdoc.getStringUnitWidth(s); wc.set(key, u); }
    return u * pt * PT;
  }
  const mc = new Map();
  function fromNode(node) {
    const svg = node.querySelector('svg');
    const err = node.querySelector('[data-mml-node="merror"]');
    const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    svg.querySelectorAll('[stroke]').forEach(e => e.setAttribute('stroke', 'none'));
    svg.querySelectorAll('[stroke-width]').forEach(e => e.removeAttribute('stroke-width'));
    return { w: vb[2] / 1000, h: vb[3] / 1000, asc: -vb[1] / 1000, desc: (vb[3] + vb[1]) / 1000, vb: vb.join(' '),
      inner: svg.innerHTML, err: err ? (err.getAttribute('title') || err.textContent || 'TeX hatası') : '' };
  }
  function texOf(strings) {
    const out = [];
    for (const s of strings) for (const t of tokenize(s, 'rm')) if (t.t === 'm' || t.t === 'dm') out.push([t.tex, t.t === 'dm']);
    return out;
  }
  // MathJax 4 yazı tipini parça parça yüklediği için dönüşümleri önceden ve eşzamansız yap
  async function prepare(strings) {
    await ensure();
    for (const [tex, d] of texOf(strings)) {
      const key = (d ? 'D' : 'I') + tex;
      if (mc.has(key)) continue;
      try { mc.set(key, fromNode(await window.MathJax.tex2svgPromise(tex, { display: d }))); }
      catch (e) { mc.set(key, { w: 2, h: 1, asc: 0.75, desc: 0.25, vb: '0 -750 2000 1000', inner: '', err: String(e.message || e) }); }
    }
  }
  function math(tex, display) {
    const key = (display ? 'D' : 'I') + tex;
    if (mc.has(key)) return mc.get(key);
    let r;
    try {
      const node = window.MathJax.tex2svg(tex, { display: !!display });
      r = fromNode(node);
    } catch (e) {
      if (/retry/i.test(String(e && e.message))) return { w: 2, h: 1, asc: 0.75, desc: 0.25, vb: '0 -750 2000 1000', inner: '', err: '', pending: true };
      r = { w: 2, h: 1, asc: 0.75, desc: 0.25, vb: '0 -750 2000 1000', inner: '', err: String(e.message || e) };
    }
    mc.set(key, r);
    return r;
  }

  /* ---------- zengin metin ---------- */
  const CMD = { ldots: '…', dots: '…', '%': '%', '&': '&', '#': '#', '_': '_', '$': '$', '{': '{', '}': '}',
    quad: '\u2003', qquad: '\u2003\u2003', enspace: '\u2002', ',': '\u2009', ' ': ' ', textendash: '–', textemdash: '—', S: '§', LaTeX: 'LaTeX' };
  function readGroup(s, i) { // s[i] === '{'
    let d = 0, j = i;
    for (; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '{') d++;
      else if (s[j] === '}') { d--; if (!d) return { body: s.slice(i + 1, j), end: j + 1 }; }
    }
    return { body: s.slice(i + 1), end: s.length };
  }
  function findClose(s, i, close) {
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\' && close !== '\\]' && close !== '\\)') { j++; continue; }
      if (s.startsWith(close, j)) return j;
      if (s[j] === '\\') j++;
    }
    return -1;
  }
  function typo(w) {
    return w.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”').replace(/'/g, '’');
  }
  // → [{t:'w',s,f} | {t:'sp'} | {t:'m',tex} | {t:'dm',tex} | {t:'br'} | {t:'par'}]
  function tokenizeInner(src, font) { return tokenize(src, font, true); }
  function tokenize(src, font, keepEdges) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) { out.push({ t: 'w', s: typo(buf), f: font }); buf = ''; } };
    src = String(src || '').replace(/\r/g, '');
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (src.startsWith('$$', i) || src.startsWith('\\[', i)) {
        const close = src[i] === '$' ? '$$' : '\\]';
        const j = findClose(src, i + 2, close);
        flush();
        if (j < 0) { out.push({ t: 'm', tex: src.slice(i + 2), open: true }); break; }
        out.push({ t: 'dm', tex: src.slice(i + 2, j) }); i = j + 2; continue;
      }
      if (c === '$' || src.startsWith('\\(', i)) {
        const close = c === '$' ? '$' : '\\)';
        const j = findClose(src, i + (c === '$' ? 1 : 2), close);
        flush();
        if (j < 0) { out.push({ t: 'm', tex: src.slice(i + 1), open: true }); break; }
        out.push({ t: 'm', tex: src.slice(i + (c === '$' ? 1 : 2), j) }); i = j + close.length; continue;
      }
      if (src.startsWith('\\\\', i)) { flush(); out.push({ t: 'br' }); i += 2; if (src[i] === '[') { const j = src.indexOf(']', i); if (j > 0) i = j + 1; } continue; }
      if (c === '\n') {
        flush();
        let j = i; while (src[j + 1] === ' ') j++;
        if (src[j + 1] === '\n') { out.push({ t: 'par' }); i = j + 2; while (src[i] === '\n') i++; }
        else { out.push({ t: 'br' }); i++; }
        continue;
      }
      if (c === '\\') {
        const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
        const name = m ? m[1] : '';
        let j = i + 1 + name.length;
        if (/^(textbf|textit|emph|textrm|textsf|underline|mbox|text)$/.test(name)) {
          while (src[j] === ' ') j++;
          if (src[j] === '{') {
            const g = readGroup(src, j);
            const f = name === 'textbf' ? 'rmb' : (name === 'textit' || name === 'emph') ? 'rmi' : font;
            flush();
            out.push(...tokenizeInner(g.body, f)); i = g.end; continue;
          }
        }
        if (name === '\n' || name === ' ') { flush(); out.push({ t: 'sp' }); i = j; continue; }
        if (CMD[name] != null) {
          const v = CMD[name];
          if (/^\s+$/.test(v) && v !== '\u2009') { flush(); out.push({ t: 'sp', w: v === '\u2003\u2003' ? 2 : v === '\u2003' ? 1 : 0.5 }); }
          else buf += v;
          i = j; if (/^[a-zA-Z]+$/.test(name) && src[i] === ' ' && !/^\s+$/.test(v)) i++;
          continue;
        }
        if (/^(newpage|pagebreak|clearpage|noindent|par|vspace|hspace|smallskip|medskip|bigskip|centering|large|Large|small|normalsize|bfseries)$/.test(name)) {
          while (src[j] === '*') j++;
          if (src[j] === '{') j = readGroup(src, j).end;
          i = j; continue;
        }
        buf += name.length > 1 ? '' : name; i = j; continue;
      }
      if (c === '{' || c === '}') { i++; continue; }
      if (c === '~') { buf += '\u00a0'; i++; continue; }
      if (c === ' ' || c === '\t') { flush(); if (!out.length || out[out.length - 1].t !== 'sp') out.push({ t: 'sp' }); i++; continue; }
      buf += c; i++;
    }
    flush();
    if (keepEdges) return out;
    // kenar boşluklarını temizle
    while (out.length && (out[0].t === 'sp')) out.shift();
    while (out.length && (out[out.length - 1].t === 'sp' || out[out.length - 1].t === 'br' || out[out.length - 1].t === 'par')) out.pop();
    return out;
  }

  /* ---------- satır düzeni ---------- */
  // atomlar: boşlukla ayrılmış, kırılmayan kutu grupları
  function boxes(tokens, pt) {
    const fmm = pt * PT, atoms = [];
    let cur = null, spw = tw(' ', 'rm', pt), pendingSp = 0;
    const startAtom = () => { cur = { items: [], w: 0, sp: pendingSp }; pendingSp = 0; atoms.push(cur); };
    const errs = [];
    for (const tk of tokens) {
      if (tk.t === 'sp') { cur = null; pendingSp = tk.w ? tk.w * pt * PT : spw; continue; }
      if (tk.t === 'br' || tk.t === 'par' || tk.t === 'dm') {
        cur = null; pendingSp = 0;
        if (tk.t === 'dm') {
          const m = math(tk.tex, true); if (m.err) errs.push(m.err);
          atoms.push({ dm: { k: 'm', w: m.w * fmm, asc: m.asc * fmm, desc: m.desc * fmm, vb: m.vb, inner: m.inner, err: m.err } });
        } else atoms.push({ brk: tk.t });
        continue;
      }
      if (!cur) startAtom();
      if (tk.t === 'w') {
        const w = tw(tk.s, tk.f, pt);
        cur.items.push({ k: 't', s: tk.s, f: tk.f, pt, x: cur.w, w, asc: 0.70 * fmm, desc: 0.22 * fmm }); cur.w += w;
      } else if (tk.t === 'm') {
        const m = math(tk.tex, false); if (m.err || tk.open) errs.push(m.err || 'Kapanmamış $ işareti');
        const pad = 0.04 * fmm;
        cur.items.push({ k: 'm', x: cur.w + pad, w: m.w * fmm, asc: m.asc * fmm, desc: m.desc * fmm, vb: m.vb, inner: m.inner, err: m.err || (tk.open ? 'Kapanmamış $' : '') });
        cur.w += m.w * fmm + 2 * pad;
      }
    }
    return { atoms, errs };
  }
  function lineBreak(atoms, width, pt) {
    const fmm = pt * PT, lines = [];
    let line = { items: [], w: 0, asc: 0.70 * fmm, desc: 0.22 * fmm, gapBefore: 0 };
    const push = () => { lines.push(line); line = { items: [], w: 0, asc: 0.70 * fmm, desc: 0.22 * fmm, gapBefore: 0 }; };
    for (const a of atoms) {
      if (a.brk) { push(); if (a.brk === 'par') line.gapBefore = 2; continue; }
      if (a.dm) {
        if (line.items.length) push();
        const it = Object.assign({}, a.dm, { x: Math.max(0, (width - a.dm.w) / 2) });
        lines.push({ items: [it], w: it.w, asc: it.asc + 1, desc: it.desc + 1, gapBefore: 0 });
        continue;
      }
      const sp = line.items.length ? a.sp : 0;
      if (line.items.length && line.w + sp + a.w > width) { push(); }
      const x0 = line.items.length ? line.w + a.sp : 0;
      for (const it of a.items) {
        line.items.push(Object.assign({}, it, { x: x0 + it.x }));
        line.asc = Math.max(line.asc, it.asc); line.desc = Math.max(line.desc, it.desc);
      }
      line.w = x0 + a.w;
    }
    if (line.items.length || !lines.length) lines.push(line);
    return lines;
  }
  // satırları dikey yerleştir; dönen öğeler göreli (x, taban çizgisi y)
  function stack(lines, x0, y0) {
    const items = [];
    let base = null, prevDesc = 0;
    for (const L of lines) {
      if (base == null) base = y0 + L.asc;
      else base += Math.max(BL, prevDesc + L.asc + 1.0) + (L.gapBefore || 0);
      for (const it of L.items) items.push(place(it, x0, base));
      prevDesc = L.desc;
    }
    return { items, first: lines.length ? y0 + lines[0].asc : y0, bottom: base == null ? y0 : base + prevDesc, lastBase: base };
  }
  function place(it, x0, base) {
    if (it.k === 't') return { k: 't', x: x0 + it.x, y: base, s: it.s, f: it.f, pt: it.pt, g: 0 };
    return { k: 'm', x: x0 + it.x, y: base - it.asc, w: it.w, h: it.asc + it.desc, vb: it.vb, inner: it.inner, err: it.err };
  }
  function shift(items, dx, dy) {
    return items.map(it => {
      const o = Object.assign({}, it);
      if ('x' in o) o.x += dx; if ('y' in o) o.y += dy;
      if ('cx' in o) { o.cx += dx; o.cy += dy; }
      if ('x2' in o) { o.x2 += dx; o.y2 += dy; }
      return o;
    });
  }

  /* ---------- soru bloğu ---------- */
  const LET = 'ABCDE';
  function layoutQuestion(q, n) {
    const errs = [];
    const items = [];
    const stemW = TW - LBL;
    const st = boxes(tokenize(q.s, 'rm'), FS); errs.push(...st.errs);
    const sl = lineBreak(st.atoms, stemW, FS);
    const S = stack(sl, LBL, 0);
    items.push({ k: 't', x: 0, y: S.first, s: n + ')', f: 'rmb', pt: 12.5, g: 0 });
    items.push(...S.items);
    let y = S.bottom + 1.6;
    // şıklar
    const ch = q.c.map((c, i) => {
      const b = boxes(tokenize(c, 'rm'), FS); errs.push(...b.errs);
      const lab = LET[i] + ')';
      return { lab, labW: tw(lab, 'rm', FS), b };
    });
    const oneLine = ch.every(x => x.b.atoms.every(a => !a.brk && !a.dm));
    const widths = ch.map(x => x.labW + tw(' ', 'rm', FS) + x.b.atoms.reduce((s, a, i) => s + a.w + (i ? a.sp : 0), 0));
    const gap = 7;
    const rowW = widths.reduce((s, w) => s + w, 0) + gap * 4;
    let mode = q.lay === 'col' ? 'col' : (q.lay === 'row' || q.lay === 'auto') && oneLine && rowW <= stemW - 2 ? 'row' : 'col';
    if (q.lay === 'auto' && mode === 'row' && rowW > stemW * 0.92) mode = 'col';
    if (mode === 'row') {
      const fmm = FS * PT;
      let asc = 0.70 * fmm, desc = 0.22 * fmm;
      ch.forEach(x => x.b.atoms.forEach(a => a.items && a.items.forEach(it => { asc = Math.max(asc, it.asc); desc = Math.max(desc, it.desc); })));
      const base = y + asc + 0.6;
      let x = LBL + 2;
      ch.forEach((c, i) => {
        items.push({ k: 't', x, y: base, s: c.lab, f: 'rm', pt: FS, g: 0 });
        let cx = x + c.labW + tw(' ', 'rm', FS);
        c.b.atoms.forEach((a, j) => { if (j) cx += a.sp; a.items.forEach(it => items.push(place(it, cx, base))); cx += a.w; });
        x += widths[i] + gap;
      });
      y = base + desc;
    } else {
      ch.forEach(c => {
        const L = lineBreak(c.b.atoms, stemW - 7, FS);
        if (!L.length || !L[0].items.length) L[0] = L[0] || { items: [], w: 0, asc: 0.70 * FS * PT, desc: 0.22 * FS * PT };
        const R = stack(L, LBL + 7, y + 0.6);
        items.push({ k: 't', x: LBL, y: R.first, s: c.lab, f: 'rm', pt: FS, g: 0 });
        items.push(...R.items);
        y = R.bottom + 0.9;
      });
    }
    return { items, h: y, errs, mode };
  }

  /* ---------- optik form (OMR.layout ile aynı geometri) ---------- */
  function formItems(L, x0, y0, bk) {
    const it = [];
    const T = (x, y, s, f, pt, g, anchor) => {
      const w = tw(s, f, pt);
      const xx = anchor === 'c' ? x - w / 2 : anchor === 'r' ? x - w : x;
      it.push({ k: 't', x: x0 + xx, y: y0 + y + 0.35 * pt * PT, s, f, pt, g: g || 0 });
    };
    for (const [mx, my] of L.markers) it.push({ k: 'r', x: x0 + mx - 3, y: y0 + my - 3, w: 6, h: 6, fill: 0 });
    it.push({ k: 'r', x: x0 + 12, y: y0 - 1.2, w: 28, h: 2.4, fill: 0 });
    it.push({ k: 'l', x: x0 + 5, y: y0 + 42.5, x2: x0 + L.W - 5, y2: y0 + 42.5, g: 191, lw: 0.2 });
    const N = L.N;
    T(9 + (N - 1) * 2.5, 6.5, 'ÖĞRENCİ NUMARASI', 'sfb', 7.6, 0, 'c');
    L.digits.forEach((col, j) => {
      it.push({ k: 'r', x: x0 + col[0].x - 2.3, y: y0 + 10.5, w: 4.6, h: 5, stroke: 64, lw: 0.25 });
      col.forEach((p, d) => {
        it.push({ k: 'c', cx: x0 + p.x, cy: y0 + p.y, r: 2, stroke: 64, lw: 0.3 });
        T(p.x, p.y, String(d), 'sf', 5.5, 140, 'c');
      });
    });
    if (L.booklet) {
      T(L.booklet[0].x, 6.5, 'KİTAPÇIK', 'sfb', 7.6, 0, 'c');
      L.booklet.forEach((p, i) => {
        it.push({ k: 'c', cx: x0 + p.x, cy: y0 + p.y, r: 2, stroke: 64, lw: 0.3 });
        T(p.x, p.y, 'AB'[i], 'sf', 5.5, 140, 'c');
        if (bk === 'AB'[i]) it.push({ k: 'c', cx: x0 + p.x, cy: y0 + p.y, r: 2.05, fill: 0 });
      });
    }
    const AX = L.answers[0][0].x - 7;
    T((AX + L.W - 10) / 2, 6.5, 'CEVAPLAR', 'sfb', 7.6, 0, 'c');
    L.answers.forEach((row, q) => {
      T(row[0].x - 7 + 4.2, row[0].y, String(q + 1), 'sfb', 7.6, 0, 'r');
      row.forEach((p, k) => {
        it.push({ k: 'c', cx: x0 + p.x, cy: y0 + p.y, r: 2, stroke: 64, lw: 0.3 });
        T(p.x, p.y, LET[k], 'sf', 5.5, 140, 'c');
      });
    });
    return it;
  }
  function formNote(N, y) {
    const it = [], pt = 8.6, f = 'sf';
    const parts1 = [['t', 'Yuvarlağı tamamen doldurun:'], ['g', 'full'], ['t', 'doğru;'], ['g', 'slash'], ['g', 'check'], ['g', 'dot'], ['t', 'yanlış.']];
    const gw = 3.4, gapw = 1.6;
    let w = 0;
    parts1.forEach(p => { w += (p[0] === 't' ? tw(p[1], f, pt) : gw) + gapw; });
    let x = (PG.w - w) / 2;
    parts1.forEach(p => {
      if (p[0] === 't') { it.push({ k: 't', x, y, s: p[1], f, pt, g: 0 }); x += tw(p[1], f, pt) + gapw; return; }
      const cx = x + gw / 2, cy = y - 1.0;
      if (p[1] === 'full') it.push({ k: 'c', cx, cy, r: 1.5, fill: 0 });
      else {
        it.push({ k: 'c', cx, cy, r: 1.5, stroke: 64, lw: 0.28 });
        if (p[1] === 'slash') it.push({ k: 'l', x: cx - 0.95, y: cy + 0.95, x2: cx + 0.95, y2: cy - 0.95, g: 0, lw: 0.28 });
        if (p[1] === 'check') { it.push({ k: 'l', x: cx - 0.9, y: cy, x2: cx - 0.25, y2: cy + 0.75, g: 0, lw: 0.28 }); it.push({ k: 'l', x: cx - 0.25, y: cy + 0.75, x2: cx + 1.0, y2: cy - 0.9, g: 0, lw: 0.28 }); }
        if (p[1] === 'dot') it.push({ k: 'c', cx: cx + 0.45, cy: cy + 0.45, r: 0.45, fill: 0 });
      }
      x += gw + gapw;
    });
    const s2 = N + ' haneli numaranızı kutulara yazıp her haneyi altındaki sütunda kodlayın. Siyah karelerin üzerine yazmayın, kağıdı katlamayın.';
    it.push({ k: 't', x: (PG.w - tw(s2, f, pt)) / 2, y: y + 4.4, s: s2, f, pt, g: 0 });
    return it;
  }

  /* ---------- sayfa düzeni ---------- */
  async function layoutExam(ex) {
    await prepare([ex.note || ''].concat(...ex.questions.map(q => [q.s].concat(q.c))));
    const nq = Math.min(30, ex.questions.length);
    const L = OMR.layout(ex.nd, nq || 1, !!ex.bk);
    const pages = [];
    let page = { items: [] };
    pages.push(page);
    const warn = [];
    // başlık
    const title = ex.title || '';
    const right = [ex.date, ex.dur].filter(Boolean).join(' / ');
    const rw = right ? tw(right, 'rmb', 10.5) : 0;
    let tpt = 15.5, tW = tw(title, 'rmb', tpt);
    while (tW > TW - 2 * rw - 8 && tpt > 11) { tpt -= 0.5; tW = tw(title, 'rmb', tpt); }
    let tx = (PG.w - tW) / 2;
    const leftMin = ex.bk ? PG.ml + 15 : PG.ml;
    if (tx + tW > PG.w - PG.mr - rw - 4) tx = leftMin;
    if (tx < leftMin) tx = leftMin;
    if (ex.bk) {
      page.items.push({ k: 'r', x: PG.ml, y: 4.5, w: 11, h: 11, stroke: 0, lw: 0.5 });
      page.items.push({ k: 't', x: PG.ml + 5.5 - tw(ex.bk, 'rmb', 20) / 2, y: 13.1, s: ex.bk, f: 'rmb', pt: 20, g: 0 });
      const kl = 'KİTAPÇIK';
      page.items.push({ k: 't', x: PG.ml + 5.5 - tw(kl, 'sfb', 5.2) / 2, y: 18.4, s: kl, f: 'sfb', pt: 5.2, g: 0 });
    }
    page.items.push({ k: 't', x: tx, y: 12, s: title, f: 'rmb', pt: tpt, g: 0 });
    if (right) page.items.push({ k: 't', x: PG.w - PG.mr - rw, y: 12, s: right, f: 'rmb', pt: 10.5, g: 0 });
    // öğrenci bilgileri
    const field = (lab, x, xe, y) => {
      page.items.push({ k: 't', x, y, s: lab, f: 'rm', pt: FS, g: 0 });
      page.items.push({ k: 'l', x: x + tw(lab, 'rm', FS) + 1.2, y: y + 0.6, x2: xe, y2: y + 0.6, g: 0, lw: 0.25 });
    };
    const mid = PG.ml + TW / 2;
    field('Numara:', PG.ml + 4, mid - 6, 24); field('Bölümü:', mid + 4, PG.w - PG.mr - 4, 24);
    field('Adı-Soyadı:', PG.ml + 4, mid - 6, 32.5); field('İmza:', mid + 4, PG.w - PG.mr - 4, 32.5);
    // optik form
    const fx = (PG.w - L.W) / 2, fy = 45;
    page.items.push(...formItems(L, fx, fy, ex.bk));
    page.items.push(...formNote(ex.nd, fy + L.H + 9));
    let y = fy + L.H + 17;
    if (ex.note) {
      const nb = boxes(tokenize(ex.note, 'rmb'), 10.5);
      const S = stack(lineBreak(nb.atoms, TW, 10.5), PG.ml + 2, y);
      page.items.push(...S.items); y = S.bottom + 5;
    }
    // sorular
    const qinfo = [];
    ex.questions.forEach((q, i) => {
      const B = layoutQuestion(q, i + 1);
      if (B.errs.length) warn.push((i + 1) + '. soruda TeX hatası: ' + B.errs[0]);
      const atTop = y <= PG.top + 0.1;
      if ((q.br && !atTop && i > 0) || (!atTop && y + B.h > PG.bottom)) { page = { items: [] }; pages.push(page); y = PG.top; }
      if (B.h > PG.bottom - PG.top) warn.push((i + 1) + '. soru bir sayfadan uzun.');
      page.items.push(...shift(B.items, PG.ml, y));
      qinfo.push({ n: i + 1, page: pages.length, mode: B.mode });
      y += B.h + 4.2;
    });
    if (ex.questions.length > 30) warn.push('Optik formda en çok 30 soru var; ' + (ex.questions.length - 30) + ' soru forma girmez.');
    const n = pages.length;
    pages.forEach((p, i) => {
      const s = 'Sayfa ' + (i + 1) + ' / ' + n;
      p.items.push({ k: 't', x: (PG.w - tw(s, 'rm', 9)) / 2, y: 291, s, f: 'rm', pt: 9, g: 90 });
    });
    return { pages, warn, qinfo, L };
  }

  /* ---------- çiziciler ---------- */
  const escX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const RMF = "LMRoman,'Latin Modern Roman','CMU Serif',Georgia,serif", SFF = "LMSans,'Latin Modern Sans',Helvetica,Arial,sans-serif";
  const FAM = { rm: RMF, rmb: RMF, rmi: RMF, sf: SFF, sfb: SFF };
  const WGT = { rmb: 700, sfb: 700 };
  function gray(g) { return 'rgb(' + g + ',' + g + ',' + g + ')'; }
  function pageSVG(p) {
    let s = '<svg class="pg" viewBox="0 0 210 297" xmlns="http://www.w3.org/2000/svg" style="color:#000;font-kerning:none"><rect width="210" height="297" fill="#fff"/>';
    for (const it of p.items) {
      if (it.k === 't') s += '<text x="' + it.x.toFixed(3) + '" y="' + it.y.toFixed(3) + '" font-family="' + FAM[it.f] + '"' + (WGT[it.f] ? ' font-weight="700"' : '') + (it.f === 'rmi' ? ' font-style="italic"' : '') + ' font-size="' + (it.pt * PT).toFixed(3) + '" fill="' + gray(it.g || 0) + '" xml:space="preserve">' + escX(it.s) + '</text>';
      else if (it.k === 'm') s += '<svg x="' + it.x.toFixed(3) + '" y="' + it.y.toFixed(3) + '" width="' + it.w.toFixed(3) + '" height="' + it.h.toFixed(3) + '" viewBox="' + it.vb + '" fill="' + (it.err ? '#c00' : '#000') + '" overflow="visible">' + it.inner + '</svg>';
      else if (it.k === 'r') s += '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" fill="' + (it.fill != null ? gray(it.fill) : 'none') + '"' + (it.stroke != null ? ' stroke="' + gray(it.stroke) + '" stroke-width="' + it.lw + '"' : '') + '/>';
      else if (it.k === 'c') s += '<circle cx="' + it.cx + '" cy="' + it.cy + '" r="' + it.r + '" fill="' + (it.fill != null ? gray(it.fill) : 'none') + '"' + (it.stroke != null ? ' stroke="' + gray(it.stroke) + '" stroke-width="' + it.lw + '"' : '') + '/>';
      else if (it.k === 'l') s += '<line x1="' + it.x + '" y1="' + it.y + '" x2="' + it.x2 + '" y2="' + it.y2 + '" stroke="' + gray(it.g || 0) + '" stroke-width="' + it.lw + '"/>';
    }
    return s + '</svg>';
  }
  async function toPDF(lay, title) {
    await ensure();
    const doc = newDoc();
    doc.setProperties({ title: title || 'Sınav', creator: 'Optik Okuyucu' });
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-10000px;top:0;width:50px;height:50px;overflow:hidden;color:#000';
    document.body.appendChild(holder);
    const NS = 'http://www.w3.org/2000/svg';
    try {
      for (let i = 0; i < lay.pages.length; i++) {
        if (i) doc.addPage();
        for (const it of lay.pages[i].items) {
          if (it.k === 't') {
            doc.setFont(it.f); doc.setFontSize(it.pt); doc.setTextColor(it.g || 0);
            doc.text(it.s, it.x, it.y, { baseline: 'alphabetic' });
          } else if (it.k === 'm') {
            const el = document.createElementNS(NS, 'svg');
            el.setAttribute('viewBox', it.vb); el.setAttribute('width', it.w + 'mm'); el.setAttribute('height', it.h + 'mm');
            el.setAttribute('style', 'color:' + (it.err ? '#c00' : '#000'));
            el.innerHTML = it.inner;
            holder.appendChild(el);
            await doc.svg(el, { x: it.x, y: it.y, width: it.w, height: it.h });
            el.remove();
          } else if (it.k === 'r') {
            const st = (it.fill != null ? 'F' : '') + (it.stroke != null ? 'D' : '');
            if (it.fill != null) doc.setFillColor(it.fill);
            if (it.stroke != null) { doc.setDrawColor(it.stroke); doc.setLineWidth(it.lw); }
            doc.rect(it.x, it.y, it.w, it.h, st === 'FD' ? 'FD' : st);
          } else if (it.k === 'c') {
            if (it.fill != null) { doc.setFillColor(it.fill); doc.circle(it.cx, it.cy, it.r, 'F'); }
            else { doc.setDrawColor(it.stroke); doc.setLineWidth(it.lw); doc.circle(it.cx, it.cy, it.r, 'S'); }
          } else if (it.k === 'l') {
            doc.setDrawColor(it.g || 0); doc.setLineWidth(it.lw); doc.line(it.x, it.y, it.x2, it.y2);
          }
        }
      }
    } finally { holder.remove(); }
    return doc.output('blob');
  }

  /* ---------- HTML önizleme (soru kartları) ---------- */
  function richHTML(src) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!isReady) return '<span class="rawtex">' + esc(src) + '</span>';
    const toks = tokenize(src, 'rm');
    let h = '';
    for (const t of toks) {
      if (t.t === 'w') h += (t.f === 'rmb' ? '<b>' + esc(t.s) + '</b>' : t.f === 'rmi' ? '<i>' + esc(t.s) + '</i>' : esc(t.s));
      else if (t.t === 'sp') h += ' ';
      else if (t.t === 'br') h += '<br>';
      else if (t.t === 'par') h += '<br><br>';
      else {
        const m = math(t.tex, t.t === 'dm');
        const svg = '<svg class="mj' + (m.err ? ' bad' : '') + '" viewBox="' + m.vb + '" style="width:' + m.w.toFixed(3) + 'em;height:' + m.h.toFixed(3) + 'em;vertical-align:' + (-m.desc).toFixed(3) + 'em" fill="currentColor" aria-label="' + esc(t.tex) + '">' + m.inner + '</svg>';
        h += t.t === 'dm' ? '<span class="dm">' + svg + '</span>' : svg;
      }
    }
    return h;
  }
  function errorsOf(src) {
    if (!isReady) return [];
    const b = boxes(tokenize(src, 'rm'), FS);
    return b.errs;
  }

  /* ---------- .tex içe aktarma ---------- */
  function argAfter(s, cmd) {
    const i = s.indexOf(cmd); if (i < 0) return null;
    const args = []; let j = i + cmd.length;
    for (let k = 0; k < 3; k++) {
      while (/\s/.test(s[j])) j++;
      if (s[j] !== '{') break;
      const g = readGroup(s, j); args.push(g.body); j = g.end;
    }
    return args;
  }
  function mapOutsideMath(t, fn) {
    let out = '', i = 0, buf = '';
    while (i < t.length) {
      if (t[i] === '\\' && (t[i + 1] === '$' || t[i + 1] === '\\')) { if (t[i + 1] === '$') { buf += '\\$'; i += 2; continue; } }
      if (t[i] === '$' || t.startsWith('\\[', i) || t.startsWith('\\(', i)) {
        const close = t.startsWith('$$', i) ? '$$' : t[i] === '$' ? '$' : t[i + 1] === '[' ? '\\]' : '\\)';
        const open = close === '$' ? 1 : 2;
        const j = findClose(t, i + open, close);
        out += fn(buf); buf = '';
        if (j < 0) { out += t.slice(i); return out; }
        out += t.slice(i, j + close.length); i = j + close.length; continue;
      }
      buf += t[i]; i++;
    }
    return out + fn(buf);
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function cleanBlock(t, keepBreaks) {
    t = t.replace(/\\(vspace|vskip|hspace|addpoints|droppoints)\*?\s*(\{[^}]*\})?/g, ' ');
    t = t.replace(/\\(newpage|pagebreak|clearpage|noindent|par|medskip|smallskip|bigskip|centering)\b/g, ' ');
    t = t.replace(/\\begin\{(enumerate|itemize)\}(\[[^\]]*\])?([\s\S]*?)\\end\{\1\}/g, (m, env, opt, body) => {
      const items = body.split(/\\item(?![a-zA-Z])/).slice(1).map(x => x.trim());
      const lab = (k) => {
        if (env === 'itemize') return '•';
        const o = opt || '';
        if (/\\Roman/.test(o)) return (ROMAN[k] || k + 1) + '.';
        if (/\\roman/.test(o)) return (ROMAN[k] || String(k + 1)).toLowerCase() + '.';
        if (/\\Alph/.test(o)) return String.fromCharCode(65 + k) + ')';
        if (/\\alph/.test(o)) return String.fromCharCode(97 + k) + ')';
        return (k + 1) + '.';
      };
      return '\u0001' + items.map((x, k) => lab(k) + ' ' + x.replace(/\s*\n\s*/g, ' ')).join('\u0001') + '\u0001';
    });
    t = t.replace(/[ \t]*\n[ \t]*/g, ' ');
    t = mapOutsideMath(t, s => s.replace(/\\\\(\[[^\]]*\])?/g, keepBreaks ? '\u0001' : ' '));
    t = t.replace(/\u0001/g, '\n').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).join('\n');
    return t.replace(/^\n+|\n+$/g, '').replace(/\n{2,}/g, '\n');
  }
  function parseTex(src) {
    src = String(src).replace(/\r/g, '').replace(/(^|[^\\])%.*$/gm, '$1');
    const res = { title: '', date: '', dur: '', questions: [] };
    const hdr = argAfter(src, '\\firstpageheader') || argAfter(src, '\\header') || null;
    const strip = s => cleanBlock(s || '', false).replace(/\\[a-zA-Z]+\*?/g, '').replace(/\\./g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    if (hdr) {
      res.title = strip(hdr[1] || hdr[0]);
      const r = strip(hdr[2] || '');
      const m = /(.*?)\s*\/\s*([^/]*\bdk|[^/]*dakika)\s*$/.exec(r);
      if (m) { res.date = m[1].trim(); res.dur = m[2].trim(); } else res.date = r;
    }
    let body = src;
    const b0 = src.indexOf('\\begin{questions}'), b1 = src.lastIndexOf('\\end{questions}');
    if (b0 >= 0) body = src.slice(b0 + 17, b1 > b0 ? b1 : undefined);
    const chunks = body.split(/\\question(?![a-zA-Z])/);
    let nextBr = false;
    for (let i = 1; i < chunks.length; i++) {
      let ch = chunks[i].replace(/^\s*\[[^\]]*\]/, '');
      const env = /\\begin\{(choices|oneparchoices|checkboxes|oneparcheckboxes)\}([\s\S]*?)\\end\{\1\}/.exec(ch);
      let stem = ch, tail = '', choices = [], key = '', lay = 'auto';
      if (env) {
        stem = ch.slice(0, env.index); tail = ch.slice(env.index + env[0].length);
        lay = /onepar/.test(env[1]) ? 'row' : 'col';
        const parts = env[2].split(/\\(CorrectChoice|choice)(?![a-zA-Z])/);
        for (let k = 1; k < parts.length; k += 2) {
          if (parts[k] === 'CorrectChoice') key += 'ABCDE'[choices.length] || '';
          choices.push(cleanBlock(parts[k + 1] || '', false));
        }
      }
      const q = { s: cleanBlock(stem, true), c: Array.from({ length: 5 }, (_, k) => choices[k] || ''), k: key, lay, br: nextBr };
      nextBr = /\\(newpage|pagebreak|clearpage)\b/.test(tail);
      res.questions.push(q);
    }
    return res;
  }

  /* ---------- .tex dışa aktarma ---------- */
  function texEsc(s) { return mapOutsideMath(String(s), t => t.replace(/(^|[^\\])%/g, '$1\\%').replace(/(^|[^\\])&/g, '$1\\&').replace(/(^|[^\\])#/g, '$1\\#')); }
  function stemTex(s) {
    const t = texEsc(s).replace(/\$\$([\s\S]*?)\$\$/g, '\\[$1\\]');
    return t.split(/\n/).join('\\\\\n');
  }
  async function genTex(ex) {
    let modes = [];
    try { await prepare([].concat(...ex.questions.map(q => [q.s].concat(q.c)))); modes = ex.questions.map((q, i) => layoutQuestion(q, i + 1).mode); } catch (e) { modes = ex.questions.map(q => q.lay === 'row' ? 'row' : 'col'); }
    const right = [ex.date, ex.dur].filter(Boolean).join(' / ');
    let t = '';
    t += '\\documentclass[11pt,a4paper]{exam}\n\\usepackage{amsmath,amssymb}\n\\usepackage{enumitem}\n\\usepackage{tikz}\n\\usepackage{pgffor}\n';
    t += '\\renewcommand{\\baselinestretch}{1.3}\n\\renewcommand\\questionlabel{\\thequestion)}\n\\renewcommand{\\thequestion}{\\bfseries\\large\\arabic{question}}\n';
    t += '\\renewcommand{\\choiceshook}{\\setlength{\\leftmargin}{0pt}\\setlength{\\itemsep}{0.5ex}}\n\\renewcommand{\\choicelabel}{\\Alph{choice})}\n';
    t += '\\usepackage[pass]{geometry}\n\\newgeometry{top=20mm,left=8mm,right=8mm,bottom=10mm}\n\n';
    t += '\\input{optik_form}\n\\renewcommand{\\NumaraHane}{' + ex.nd + '}\n\\renewcommand{\\SoruSayisi}{' + Math.min(30, ex.questions.length) + '}\n';
    t += '\\renewcommand{\\Kitapcik}{' + (ex.bk || '') + '}\n\n';
    t += '\\begin{document}\n\\pagestyle{headandfoot}\n\\firstpageheader{' + (ex.bk ? '\\fbox{\\Large\\bfseries ' + ex.bk + '} {\\scriptsize KİTAPÇIK}' : '') + '}{\\LARGE\\bfseries ' + texEsc(ex.title || '') + '}{\\textbf{' + texEsc(right) + '}}\n';
    t += '\\firstpagefooter{}{}{}\n\\runningfooter{}{Sayfa \\thepage}{}\n\n';
    t += '\\noindent\\begin{tabular}{p{0.45\\linewidth} p{0.45\\linewidth}}\nNumara: \\hrulefill & Bölümü: \\hrulefill \\\\\nAdı-Soyadı: \\hrulefill & İmza: \\hrulefill \\\\\n\\end{tabular}\n\n';
    t += '\\vspace{3mm}\n\\begin{center}\\OptikForm\\end{center}\n\\vspace{-2mm}\n\\begin{center}\\OptikFormNot\\end{center}\n\n';
    if (ex.note) t += '\\textbf{' + texEsc(ex.note) + '}\n\n';
    t += '\\begin{questions}\n';
    ex.questions.forEach((q, i) => {
      if (q.br && i) t += '\\newpage\n';
      t += '\\question ' + stemTex(q.s) + '\n';
      const env = modes[i] === 'row' ? 'oneparchoices' : 'choices';
      if (env === 'oneparchoices') t += '\n';
      t += '\\begin{' + env + '}\n';
      q.c.forEach((c, k) => { t += ((q.k || '').indexOf('ABCDE'[k]) >= 0 ? '\\CorrectChoice ' : '\\choice ') + texEsc(c) + '\n'; });
      t += '\\end{' + env + '}\n\n';
    });
    t += '\\end{questions}\n\\end{document}\n';
    return t;
  }
  async function texZip(list) {
    if (!Array.isArray(list)) list = [list];
    if (!window.JSZip) await loadScript(URLS.jszip);
    const z = new window.JSZip();
    for (const ex of list) z.file(ex.bk ? 'sinav_' + ex.bk + '.tex' : 'sinav.tex', await genTex(ex));
    z.file('optik_form.tex', OPTIK_TEX);
    return z.generateAsync({ type: 'blob' });
  }

  function questionMode(q) { try { return layoutQuestion(q, 1).mode; } catch (e) { return 'col'; } }
  function errorsIn(strings) { if (!isReady) return []; const out = []; for (const x of strings) out.push(...errorsOf(x)); return out; }
  return { ensure, prepare, questionMode, errorsIn, ready: () => isReady, layoutExam, pageSVG, toPDF, richHTML, errorsOf, parseTex, genTex, texZip, DEFAULT_NOTE };
})();

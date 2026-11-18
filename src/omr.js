/* Optik form okuyucu çekirdeği — saf JS (tarayıcı + Node) */
const OMR = (function () {
  const P = 5;

  // Form geometrisi (mm) — optik_form.tex ile birebir aynı
  function layout(N, Q, booklet) {
    const C = Math.ceil(Q / 10);
    const XB = 9 + (N - 1) * P + 12;
    const AX = booklet ? XB + 13 : 9 + (N - 1) * P + 14;
    const W = AX + (C - 1) * 36 + 7 + 20 + 10;
    const H = 74;
    const digits = [];
    for (let j = 0; j < N; j++) {
      const col = [];
      for (let d = 0; d < 10; d++) col.push({ x: 9 + j * P, y: 20 + d * P });
      digits.push(col);
    }
    const answers = [];
    for (let q = 0; q < Q; q++) {
      const c = Math.floor(q / 10), r = q % 10, bx = AX + c * 36;
      const row = [];
      for (let k = 0; k < 5; k++) row.push({ x: bx + 7 + k * P, y: 20 + r * P });
      answers.push(row);
    }
    return { N, Q, W, H, digits, answers, booklet: booklet ? [{ x: XB, y: 20 }, { x: XB, y: 25 }] : null,
      markers: [[0, 0], [W, 0], [W, H], [0, H]] };
  }

  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4)
      g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }

  function binarize(g, w, h) {
    const W1 = w + 1;
    const I = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row;
      }
    }
    const s = Math.max(8, Math.round(Math.max(w, h) / 16));
    const b = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - s), y1 = Math.min(h, y + s + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - s), x1 = Math.min(w, x + s + 1);
        const sum = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        b[y * w + x] = g[y * w + x] < mean * 0.7 ? 1 : 0;
      }
    }
    return b;
  }

  function components(b, w, h, minA, maxA) {
    const lab = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const out = [];
    for (let i = 0; i < w * h; i++) {
      if (!b[i] || lab[i]) continue;
      let sp = 0; stack[sp++] = i; lab[i] = 1;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      let minx = w, maxx = 0, miny = h, maxy = 0;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && b[p - 1] && !lab[p - 1]) { lab[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && b[p + 1] && !lab[p + 1]) { lab[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && b[p - w] && !lab[p - w]) { lab[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && b[p + w] && !lab[p + w]) { lab[p + w] = 1; stack[sp++] = p + w; }
      }
      if (n < minA || n > maxA) continue;
      const mx = sx / n, my = sy / n;
      const vx = sxx / n - mx * mx, vy = syy / n - my * my, vxy = sxy / n - mx * my;
      const det = vx * vy - vxy * vxy;
      if (det <= 0) continue;
      const solid = n / (12 * Math.sqrt(det));
      const tr = (vx + vy) / 2, disc = Math.sqrt((vx - vy) * (vx - vy) / 4 + vxy * vxy);
      const elong = (tr + disc) / Math.max(1e-9, tr - disc);
      const bfill = n / ((maxx - minx + 1) * (maxy - miny + 1));
      if (solid < 0.8 || solid > 1.25 || elong > 3 || bfill < 0.45) continue;
      out.push({ x: mx, y: my, n });
    }
    return out;
  }

  // 4 nokta eşlemesinden homografi (mm -> piksel)
  function homography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const [X, Y] = src[i], [u, v] = dst[i];
      A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y, u]);
      A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y, v]);
    }
    for (let c = 0; c < 8; c++) {
      let piv = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
      }
    }
    const h = [];
    for (let i = 0; i < 8; i++) h.push(A[i][8] / A[i][i]);
    h.push(1);
    return h;
  }
  function proj(H, X, Y) {
    const z = H[6] * X + H[7] * Y + 1;
    return [(H[0] * X + H[1] * Y + H[2]) / z, (H[3] * X + H[4] * Y + H[5]) / z];
  }
  function jacDet(H, X, Y) {
    const e = 0.5;
    const a = proj(H, X - e, Y), b = proj(H, X + e, Y), c = proj(H, X, Y - e), d = proj(H, X, Y + e);
    const ux = (b[0] - a[0]) / (2 * e), vx = (b[1] - a[1]) / (2 * e);
    const uy = (d[0] - c[0]) / (2 * e), vy = (d[1] - c[1]) / (2 * e);
    return Math.abs(ux * vy - uy * vx);
  }

  function bin_at(b, w, h, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return b[y * w + x];
  }

  function findFrame(b, w, h, L) {
    const m = Math.max(w, h);
    let cands = components(b, w, h, Math.pow(m * 0.011, 2), Math.pow(m * 0.12, 2));
    cands.sort((a, c) => c.n - a.n);
    cands = cands.slice(0, 24);
    const ratio = L.W / L.H;
    let best = null;
    const n = cands.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
      const q = [cands[i], cands[j], cands[k], cands[l]];
      let amax = 0, amin = Infinity;
      for (const c of q) { if (c.n > amax) amax = c.n; if (c.n < amin) amin = c.n; }
      if (amax / amin > 3.2) continue;
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      q.sort((a, c) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(c.y - cy, c.x - cx));
      let sgn = 0, convex = true;
      for (let t = 0; t < 4; t++) {
        const p0 = q[t], p1 = q[(t + 1) % 4], p2 = q[(t + 2) % 4];
        const cr = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
        const s = Math.sign(cr);
        if (sgn === 0) sgn = s; else if (s !== sgn) { convex = false; break; }
      }
      if (!convex) continue;
      let area = 0;
      for (let t = 0; t < 4; t++) area += q[t].x * q[(t + 1) % 4].y - q[(t + 1) % 4].x * q[t].y;
      area = Math.abs(area) / 2;
      if (area < w * h * 0.03) continue;
      if (best && area <= best.area) continue;
      for (let rot = 0; rot < 4; rot++) {
        const P4 = [q[rot], q[(rot + 1) % 4], q[(rot + 2) % 4], q[(rot + 3) % 4]];
        const d = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
        const hor = d(P4[0], P4[1]) + d(P4[3], P4[2]), ver = d(P4[0], P4[3]) + d(P4[1], P4[2]);
        const r = (hor / ver) / ratio;
        if (r < 0.55 || r > 1.8) continue;
        const Hm = homography(L.markers, P4.map(p => [p.x, p.y]));
        if (!Hm) continue;
        let ok = true;
        for (let t = 0; t < 4; t++) {
          const exp = 36 * jacDet(Hm, L.markers[t][0], L.markers[t][1]);
          const rr = P4[t].n / exp;
          if (rr < 0.45 || rr > 2.2) { ok = false; break; }
        }
        if (!ok) continue;
        let on = 0, tot = 0, off = 0;
        for (let X = 14; X <= 38; X += 2) {
          for (const Y of [-0.5, 0, 0.5]) { const p = proj(Hm, X, Y); on += bin_at(b, w, h, p[0], p[1]); tot++; }
          const p = proj(Hm, X, 3.9); off += bin_at(b, w, h, p[0], p[1]);
        }
        if (on / tot < 0.7 || off / 13 > 0.3) continue;
        best = { area, H: Hm, pts: P4 };
        break;
      }
    }
    return best;
  }

  function samp(g, w, h, x, y) {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
  }

  const INNER = [], CELL = [], RING = [];
  for (let y = -1.4; y <= 1.401; y += 0.35) for (let x = -1.4; x <= 1.401; x += 0.35)
    if (x * x + y * y <= 1.35 * 1.35) INNER.push([x, y]);
  for (let y = -2.4; y <= 2.401; y += 0.6) for (let x = -2.4; x <= 2.401; x += 0.6) CELL.push([x, y]);
  for (let t = 0; t < 24; t++) RING.push([2 * Math.cos(t * Math.PI / 12), 2 * Math.sin(t * Math.PI / 12)]);

  // Grubu (satır/sütun) halka koyuluğuna göre yerel olarak hizala
  function refine(H, g, w, h, pts) {
    let best = { dx: 0, dy: 0, s: -1 };
    for (let dy = -1.2; dy <= 1.201; dy += 0.4) for (let dx = -1.2; dx <= 1.201; dx += 0.4) {
      let s = 0;
      for (const p of pts) for (const r of RING) {
        const q = proj(H, p.x + dx + r[0], p.y + dy + r[1]);
        s += 255 - samp(g, w, h, q[0], q[1]);
      }
      const pen = (dx * dx + dy * dy) * 0.02 * s / 1;
      if (s - pen > best.s) best = { dx, dy, s: s - pen };
    }
    return pts.map(p => ({ x: p.x + best.dx, y: p.y + best.dy }));
  }

  function darkness(H, g, w, h, p) {
    const cell = CELL.map(o => { const q = proj(H, p.x + o[0], p.y + o[1]); return samp(g, w, h, q[0], q[1]); });
    cell.sort((a, b) => a - b);
    const white = Math.max(40, cell[Math.floor(cell.length * 0.9)]);
    let s = 0;
    for (const o of INNER) {
      const q = proj(H, p.x + o[0], p.y + o[1]);
      const v = 1 - samp(g, w, h, q[0], q[1]) / white;
      s += v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return s / INNER.length;
  }

  function otsu(vals) {
    const B = 100, hist = new Array(B).fill(0);
    for (const v of vals) hist[Math.min(B - 1, Math.max(0, Math.floor(v * B)))]++;
    const tot = vals.length;
    let sum = 0; for (let i = 0; i < B; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, th = 30;
    for (let i = 0; i < B; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = tot - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = i + 1; }
    }
    return th / B;
  }

  // Bir grup (5 şık / 10 rakam / 2 kitapçık) için karar
  function decide(ds, T) {
    const BAND = 0.06;
    const idx = ds.map((d, i) => i).sort((a, b) => ds[b] - ds[a]);
    const d1 = ds[idx[0]], d2 = ds.length > 1 ? ds[idx[1]] : 0;
    const marked = ds.map((d, i) => i).filter(i => ds[i] >= T);
    let flag = false;
    if (d1 >= T - BAND && d1 < T + BAND) flag = true;
    if (d2 >= T - BAND && d2 < T + BAND) flag = true;
    if (marked.length === 0) return { v: -1, flag };
    if (marked.length === 1) return { v: marked[0], flag };
    // birden fazla: belirgin fark varsa en koyuyu öner ama işaretle
    if (d2 < d1 * 0.65) return { v: idx[0], flag: true };
    return { v: -2, flag: true, multi: marked };
  }

  // halka koyuluğu: basılı yuvarlakların gerçekten beklenen yerde olup olmadığını sınar
  function ringScore(H, g, w, h, groups) {
    // her grup için halka (basılı çember) ile çemberler arası boşluk koyuluğu farkı
    const per = [];
    for (const G of groups) {
      let on = 0, off = 0, n = 0;
      for (const p of G.pts) {
        for (const r of RING) {
          const a = proj(H, p.x + r[0], p.y + r[1]); on += 255 - samp(g, w, h, a[0], a[1]);
          const b = proj(H, p.x + 2.5 + r[0] * 0.2, p.y + 2.5 + r[1] * 0.2); off += 255 - samp(g, w, h, b[0], b[1]);
        }
        n += RING.length;
      }
      per.push((on - off) / n);
    }
    per.sort((x, y) => x - y);
    return { low: per[Math.floor(per.length * 0.1)], med: per[Math.floor(per.length / 2)] };
  }
  function read(rgba, w, h, N, Q, booklet) {
    const L = layout(N, Q, booklet);
    const g = toGray(rgba, w, h);
    const b = binarize(g, w, h);
    const fr = findFrame(b, w, h, L);
    if (!fr) return { ok: false, error: 'frame' };
    const H = fr.H;
    const pxmm = Math.sqrt(jacDet(H, L.W / 2, L.H / 2));
    const groups = [];
    L.digits.forEach((col, j) => groups.push({ kind: 'd', i: j, pts: refine(H, g, w, h, col) }));
    if (L.booklet) groups.push({ kind: 'b', i: 0, pts: refine(H, g, w, h, L.booklet) });
    L.answers.forEach((row, q) => groups.push({ kind: 'a', i: q, pts: refine(H, g, w, h, row) }));
    const rs = ringScore(H, g, w, h, groups.filter(G => G.kind !== 'b'));
    if (rs.low < 12 || rs.low < 0.7 * rs.med) return { ok: false, error: 'layout', rs };
    const all = [];
    for (const G of groups) { G.ds = G.pts.map(p => darkness(H, g, w, h, p)); all.push(...G.ds); }
    let T = otsu(all);
    T = Math.min(0.5, Math.max(0.2, T));
    const res = { ok: true, H, pxmm, T, layout: L, digits: [], answers: [], booklet: null, groups, rs };
    for (const G of groups) {
      const r = decide(G.ds, T);
      r.ds = G.ds; r.pts = G.pts;
      if (G.kind === 'd') res.digits.push(r);
      else if (G.kind === 'b') res.booklet = r;
      else res.answers.push(r);
    }
    return res;
  }

  return { layout, read, proj, homography };
})();
if (typeof module !== 'undefined') module.exports = OMR;

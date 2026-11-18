/* ---------------- depolama (cihazda: IndexedDB) ---------------- */
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('sinav-studyosu', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('exams')) db.createObjectStore('exams', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('results')) {
        const rs = db.createObjectStore('results', { keyPath: ['examId', 'no'] });
        rs.createIndex('exam', 'examId');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbReq(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function idbDone(t) { return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
const store = {
  mode: 'loading', db: null, mem: { exams: {}, results: {} }, curExam: null,
  async init() {
    try { if (!window.indexedDB) throw new Error('idb'); this.db = await idbOpen(); this.mode = 'idb'; }
    catch (e) { this.mode = 'mem'; }
    app.storeReady = true;
    onExams(await this.listExams());
    renderTop();
  },
  async listExams() {
    if (this.mode === 'idb') return idbReq(this.db.transaction('exams').objectStore('exams').getAll());
    return Object.values(this.mem.exams);
  },
  async resultsOf(id) {
    if (this.mode === 'idb') {
      const rows = await idbReq(this.db.transaction('results').objectStore('results').index('exam').getAll(id));
      return rows.map(r => Object.assign({}, r, { id: r.no }));
    }
    return Object.values(this.mem.results[id] || {});
  },
  async watchResults(id) { this.curExam = id; onResults(id ? await this.resultsOf(id) : []); },
  async refresh(id) { if (id && id === this.curExam) onResults(await this.resultsOf(id)); },
  async saveExam(ex) {
    const data = Object.assign({}, ex, { kind: 'exam' });
    if (this.mode === 'idb') { const t = this.db.transaction('exams', 'readwrite'); t.objectStore('exams').put(data); await idbDone(t); }
    else this.mem.exams[ex.id] = data;
    askPersist();
    onExams(await this.listExams());
  },
  async deleteExam(id) {
    if (this.mode === 'idb') {
      const keys = await idbReq(this.db.transaction('results').objectStore('results').index('exam').getAllKeys(id));
      const t = this.db.transaction(['exams', 'results'], 'readwrite');
      t.objectStore('exams').delete(id);
      keys.forEach(k => t.objectStore('results').delete(k));
      await idbDone(t);
    } else { delete this.mem.exams[id]; delete this.mem.results[id]; }
    onExams(await this.listExams());
  },
  async saveResult(examId, rec) {
    const data = Object.assign({}, rec, { examId }); delete data.id;
    if (this.mode === 'idb') { const t = this.db.transaction('results', 'readwrite'); t.objectStore('results').put(data); await idbDone(t); }
    else (this.mem.results[examId] = this.mem.results[examId] || {})[rec.no] = Object.assign({ id: rec.no }, rec);
    ls.set('omr.dirty', '1');
    await this.refresh(examId);
  },
  async deleteResult(examId, no) {
    if (this.mode === 'idb') { const t = this.db.transaction('results', 'readwrite'); t.objectStore('results').delete([examId, no]); await idbDone(t); }
    else delete (this.mem.results[examId] || {})[no];
    await this.refresh(examId);
  },
  async exportAll() {
    const exams = await this.listExams();
    let results = [];
    if (this.mode === 'idb') results = await idbReq(this.db.transaction('results').objectStore('results').getAll());
    else for (const id in this.mem.results) for (const no in this.mem.results[id]) results.push(Object.assign({ examId: id }, this.mem.results[id][no]));
    return { app: 'sinav-studyosu', format: 1, exportedAt: new Date().toISOString(), exams, results };
  },
  async importAll(data) {
    const exams = (data.exams || []).filter(e => e && e.id && e.kind === 'exam');
    const results = (data.results || []).filter(r => r && r.examId && r.no);
    if (this.mode === 'idb') {
      const t = this.db.transaction(['exams', 'results'], 'readwrite');
      exams.forEach(e => t.objectStore('exams').put(e));
      results.forEach(r => { const x = Object.assign({}, r); delete x.id; t.objectStore('results').put(x); });
      await idbDone(t);
    } else {
      exams.forEach(e => { this.mem.exams[e.id] = e; });
      results.forEach(r => { (this.mem.results[r.examId] = this.mem.results[r.examId] || {})[r.no] = Object.assign({ id: r.no }, r); });
    }
    onExams(await this.listExams());
    await this.refresh(this.curExam);
    return { exams: exams.length, results: results.length };
  }
};
let persistAsked = false;
function askPersist() {
  if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  navigator.storage.persist().catch(() => {});
}

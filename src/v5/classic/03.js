const DB_NAME = 'gantt-desk-v5';
const DB_VERSION = 1;
const PROJECT_STORE = 'project';
const PROJECT_KEY = 'current';
const LEGACY_V2_KEY = 'gantt-desk:v2:project';
const LEGACY_V3_ACTIVE = 'gantt-desk:v3:active-project-id';
const LEGACY_V3_PREFIX = 'gantt-desk:v3:project:';
const VIEW_KEY = 'gantt-desk:v5:view';
const DRAFT_INPUT_KEY = 'gantt-desk:v5:draft:input';
const DRAFT_OUTPUT_KEY = 'gantt-desk:v5:draft:output';
const IMPORT_HASH_KEY = 'gantt-desk:v5:last-import-hash';
const FALLBACK_PROJECT_KEY = 'gantt-desk:v5:fallback-project';

class ConflictError extends Error {
  constructor(message = '別のタブで更新されています。') {
    super(message);
    this.name = 'ConflictError';
  }
}

function parseJSON(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function backupLegacyPayload(raw, source) {
  try {
    const key = `gantt-desk:v5:legacy-backup:${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ source, backedUpAt: new Date().toISOString(), payload: raw }));
    return key;
  } catch {
    return '';
  }
}

function readLegacyProject() {
  const activeId = localStorage.getItem(LEGACY_V3_ACTIVE);
  if (activeId) {
    const raw = parseJSON(localStorage.getItem(`${LEGACY_V3_PREFIX}${activeId}`));
    if (raw && typeof raw === 'object') return { raw, source: `v3:${activeId}` };
  }
  const v2 = parseJSON(localStorage.getItem(LEGACY_V2_KEY));
  if (v2 && typeof v2 === 'object') return { raw: v2, source: 'v2' };
  return null;
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

function txRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

class ProjectStorage {
  constructor({ onExternalUpdate } = {}) {
    this.db = null;
    this.fallback = false;
    this.savedRevision = 0;
    this.tabId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    this.channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel('gantt-desk-v5') : null;
    this.onExternalUpdate = onExternalUpdate || (() => {});
    this.channel?.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'saved' && data.tabId !== this.tabId) this.onExternalUpdate(data);
    });
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key === FALLBACK_PROJECT_KEY && this.fallback) {
        const project = parseJSON(event.newValue);
        if (project?.revision > this.savedRevision) this.onExternalUpdate({ type: 'saved', tabId: 'other', revision: project.revision });
      }
    });
  }

  async init() {
    try {
      this.db = await openDB();
    } catch {
      this.fallback = true;
    }
    return this.load();
  }

  async readIndexedProject() {
    if (!this.db) return null;
    const tx = this.db.transaction(PROJECT_STORE, 'readonly');
    return txRequest(tx.objectStore(PROJECT_STORE).get(PROJECT_KEY));
  }

  async writeIndexedProject(project, expectedRevision = null) {
    const db = this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, 'readwrite');
      const store = tx.objectStore(PROJECT_STORE);
      let resolved = false;
      const getRequest = store.get(PROJECT_KEY);
      getRequest.onerror = () => reject(getRequest.error || new Error('保存前の確認に失敗しました。'));
      getRequest.onsuccess = () => {
        const current = getRequest.result || null;
        const currentRevision = Number(current?.revision || 0);
        if (expectedRevision != null && current && currentRevision !== expectedRevision) {
          resolved = true;
          tx.abort();
          reject(new ConflictError());
          return;
        }
        store.put(deepCopy(project), PROJECT_KEY);
      };
      tx.oncomplete = () => {
        if (!resolved) resolve(project);
      };
      tx.onerror = () => {
        if (!resolved) reject(tx.error || new Error('保存に失敗しました。'));
      };
      tx.onabort = () => {
        if (!resolved) reject(tx.error || new Error('保存を中止しました。'));
      };
    });
  }

  async load() {
    let project = null;
    let migration = null;
    if (this.fallback) project = parseJSON(localStorage.getItem(FALLBACK_PROJECT_KEY));
    else project = await this.readIndexedProject();

    if (!project) {
      const legacy = readLegacyProject();
      if (legacy) {
        const migrated = migrateLegacyProject(legacy.raw);
        if (!migrated.errors?.length) {
          project = migrated.project;
          project.revision = Math.max(1, Number(project.revision || 0));
          project.updatedAt = new Date().toISOString();
          const backupKey = backupLegacyPayload(legacy.raw, legacy.source);
          migration = { source: legacy.source, backupKey };
        }
      }
    }
    if (!project) project = createEmptyProject();

    const view = this.readView();
    if (view) project.viewSettings = { ...project.viewSettings, ...view };

    if (this.fallback) localStorage.setItem(FALLBACK_PROJECT_KEY, JSON.stringify(project));
    else if (!(await this.readIndexedProject())) await this.writeIndexedProject(project, null);
    this.saveView(project.viewSettings);

    this.savedRevision = Number(project.revision || 0);
    return { project: deepCopy(project), migration, fallback: this.fallback };
  }

  async save(project, expectedRevision = this.savedRevision) {
    const snapshot = deepCopy(project);
    if (this.fallback) {
      const current = parseJSON(localStorage.getItem(FALLBACK_PROJECT_KEY));
      const currentRevision = Number(current?.revision || 0);
      if (current && currentRevision !== expectedRevision) throw new ConflictError();
      localStorage.setItem(FALLBACK_PROJECT_KEY, JSON.stringify(snapshot));
    } else {
      await this.writeIndexedProject(snapshot, expectedRevision);
    }
    this.saveView(snapshot.viewSettings);
    this.savedRevision = Number(snapshot.revision || 0);
    this.channel?.postMessage({ type: 'saved', tabId: this.tabId, revision: this.savedRevision, updatedAt: snapshot.updatedAt });
    return snapshot;
  }

  async forceReplace(project) {
    const snapshot = deepCopy(project);
    if (this.fallback) localStorage.setItem(FALLBACK_PROJECT_KEY, JSON.stringify(snapshot));
    else await this.writeIndexedProject(snapshot, null);
    this.saveView(snapshot.viewSettings);
    this.savedRevision = Number(snapshot.revision || 0);
    this.channel?.postMessage({ type: 'saved', tabId: this.tabId, revision: this.savedRevision, updatedAt: snapshot.updatedAt });
    return snapshot;
  }

  async reloadSaved() {
    const project = this.fallback
      ? parseJSON(localStorage.getItem(FALLBACK_PROJECT_KEY))
      : await this.readIndexedProject();
    if (!project) throw new Error('保存済みデータを読み込めませんでした。');
    const view = this.readView();
    if (view) project.viewSettings = { ...project.viewSettings, ...view };
    this.savedRevision = Number(project.revision || 0);
    return deepCopy(project);
  }

  saveView(view) {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); return true; }
    catch { return false; }
  }

  readView() {
    return parseJSON(localStorage.getItem(VIEW_KEY));
  }

  saveDraft(kind, data) {
    const key = kind === 'output' ? DRAFT_OUTPUT_KEY : DRAFT_INPUT_KEY;
    try { localStorage.setItem(key, JSON.stringify({ ...data, updatedAt: new Date().toISOString() })); return true; }
    catch { return false; }
  }

  readDraft(kind) {
    const key = kind === 'output' ? DRAFT_OUTPUT_KEY : DRAFT_INPUT_KEY;
    return parseJSON(localStorage.getItem(key));
  }

  clearDraft(kind) {
    const key = kind === 'output' ? DRAFT_OUTPUT_KEY : DRAFT_INPUT_KEY;
    localStorage.removeItem(key);
  }

  getLastImportHash() {
    return localStorage.getItem(IMPORT_HASH_KEY) || '';
  }

  setLastImportHash(hash) {
    localStorage.setItem(IMPORT_HASH_KEY, String(hash || ''));
  }

  close() {
    this.channel?.close();
    this.db?.close();
  }
}

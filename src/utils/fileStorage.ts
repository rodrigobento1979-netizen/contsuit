// Shared client-side binary storage (IndexedDB) + base64/Blob helpers
// Used by DocumentsView, OfxConverterView, and OfxAgentContext so PDFs/images
// are reliably stored and previewable even when server payloads are truncated.

const IDB_NAME = 'contsuite_documents_db';
const IDB_VERSION = 2;
const IDB_STORE = 'document_blobs';
const LEGACY_IDB_STORE = 'file_blobs';

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB indisponível neste navegador'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

export function cleanBase64(b64: string): string {
  return (b64 || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
}

export async function saveBlobToIdb(key: string, base64: string): Promise<void> {
  if (!key || !base64) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openBlobDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(cleanBase64(base64), key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IDB] Erro ao salvar arquivo local:', err);
  } finally {
    db?.close();
  }
}

async function readFromStore(db: IDBDatabase, storeName: string, key: string): Promise<string | null> {
  if (!db.objectStoreNames.contains(storeName)) return null;
  return new Promise<string | null>((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' && req.result ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getBlobFromIdb(key: string): Promise<string | null> {
  if (!key) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openBlobDb();
    const primary = await readFromStore(db, IDB_STORE, key);
    if (primary) return primary;
    if (db.objectStoreNames.contains(LEGACY_IDB_STORE)) {
      const legacy = await readFromStore(db, LEGACY_IDB_STORE, key);
      if (legacy) return legacy;
    }
    return null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function deleteBlobFromIdb(key: string): Promise<void> {
  if (!key) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openBlobDb();
    const stores = [IDB_STORE, LEGACY_IDB_STORE].filter((s) =>
      db!.objectStoreNames.contains(s)
    );
    if (stores.length === 0) return;
    await new Promise<void>((resolve) => {
      const tx = db!.transaction(stores, 'readwrite');
      for (const s of stores) {
        tx.objectStore(s).delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
  } finally {
    db?.close();
  }
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const cleaned = cleanBase64(b64);
  const byteChars = atob(cleaned);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return byteNumbers;
}

export function base64ToBlob(b64: string, mimeType = 'application/pdf'): Blob {
  const bytes = base64ToUint8Array(b64);
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo selecionado.'));
    reader.readAsDataURL(file);
  });
}

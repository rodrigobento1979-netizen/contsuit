const TOMBSTONE_KEY_PREFIX = 'contsuite_deleted_docs_';
const CACHE_KEY_PREFIX = 'contsuite_cached_docs_';
const MAX_TOMBSTONES = 500;

export function getDeletedDocumentIdsLocal(companyId?: string): string[] {
  if (!companyId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${TOMBSTONE_KEY_PREFIX}${companyId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isDocumentDeletedLocal(companyId: string | undefined, docId: string): boolean {
  if (!docId) return false;
  if (companyId && getDeletedDocumentIdsLocal(companyId).includes(docId)) {
    return true;
  }
  return getDeletedDocumentIdsLocal('__global__').includes(docId);
}

export function markDocumentDeletedLocal(companyId: string | undefined, docId: string): void {
  if (!docId || typeof window === 'undefined') return;
  const targets = Array.from(
    new Set([companyId, '__global__'].filter((x): x is string => Boolean(x)))
  );

  for (const target of targets) {
    try {
      const key = `${TOMBSTONE_KEY_PREFIX}${target}`;
      const existing = getDeletedDocumentIdsLocal(target);
      const next = [docId, ...existing.filter((id) => id !== docId)].slice(0, MAX_TOMBSTONES);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  if (companyId) {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${companyId}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((d: any) => d && d.id !== docId);
          localStorage.setItem(cacheKey, JSON.stringify(filtered));
        }
      }
    } catch {}
  }
}

export function mergeDeletedDocumentIdsLocal(companyId: string | undefined, docIds: string[]): void {
  if (!Array.isArray(docIds) || docIds.length === 0 || typeof window === 'undefined') return;
  const cleanIds = docIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
  if (cleanIds.length === 0) return;

  const targets = Array.from(
    new Set([companyId, '__global__'].filter((x): x is string => Boolean(x)))
  );

  for (const target of targets) {
    try {
      const key = `${TOMBSTONE_KEY_PREFIX}${target}`;
      const existing = getDeletedDocumentIdsLocal(target);
      const merged = Array.from(new Set([...cleanIds, ...existing])).slice(0, MAX_TOMBSTONES);
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {}
  }

  if (companyId) {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${companyId}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const delSet = new Set(cleanIds);
          const filtered = parsed.filter((d: any) => d && !delSet.has(d.id));
          localStorage.setItem(cacheKey, JSON.stringify(filtered));
        }
      }
    } catch {}
  }
}

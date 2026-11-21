import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  db, 
  auth, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from './config';
import { User, Company, Asset, ConvertedStatement, CompanyDocument } from '../types';

/**
 * Remove recursivamente propriedades undefined (Firestore rejeita undefined inclusive dentro de arrays/objetos aninhados)
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    });
    return out as T;
  }
  return value;
}

/**
 * Realiza login com Google via Popup (recomendado para o ambiente de iframe)
 */
export async function loginWithGoogle(): Promise<FirebaseUser> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Erro ao fazer login com Google:', error);
    throw error;
  }
}

/**
 * Logout
 */
export async function logoutFirebase(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    throw error;
  }
}

/**
 * Escuta mudanças de autenticação
 */
export function subscribeToAuth(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// -------------------------------------------------------------
// FIRESTORE: EMPRESAS (COMPANIES)
// -------------------------------------------------------------
export async function fetchCompaniesFromFirestore(): Promise<Company[]> {
  const path = 'companies';
  if (!auth.currentUser) {
    return [];
  }
  try {
    const snap = await getDocs(collection(db, path));
    const list: Company[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as Company);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function saveCompanyToFirestore(company: Company): Promise<void> {
  if (!auth.currentUser) return;
  const path = `companies/${company.id}`;
  try {
    await setDoc(doc(db, 'companies', company.id), stripUndefinedDeep(company), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// -------------------------------------------------------------
// FIRESTORE: BENS DO ATIVO PERMANENTE (ASSETS)
// -------------------------------------------------------------
export async function fetchAssetsFromFirestore(companyId: string): Promise<Asset[]> {
  if (!auth.currentUser || !companyId) return [];
  const path = `companies/${companyId}/assets`;
  try {
    const snap = await getDocs(collection(db, 'companies', companyId, 'assets'));
    const list: Asset[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data(), companyId } as Asset);
    });
    return list;
  } catch (error) {
    console.warn('Firestore fetchAssets warning:', error);
    return [];
  }
}

export async function saveAssetToFirestore(companyId: string, asset: Asset): Promise<void> {
  if (!auth.currentUser || !companyId || !asset?.id) return;
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(asset.id)) return;
  const path = `companies/${companyId}/assets/${asset.id}`;
  try {
    await setDoc(doc(db, 'companies', companyId, 'assets', asset.id), stripUndefinedDeep({ ...asset, companyId }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAssetFromFirestore(companyId: string, assetId: string): Promise<boolean> {
  if (!auth.currentUser || !companyId || !assetId) return false;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(assetId)) return false;
  const path = `companies/${companyId}/assets/${assetId}`;
  try {
    await deleteDoc(doc(db, 'companies', companyId, 'assets', assetId));
    return true;
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code === 'not-found') {
      return true;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
    return false;
  }
}

// -------------------------------------------------------------
// FIRESTORE: EXTRATOS CONVERTIDOS (STATEMENTS)
// -------------------------------------------------------------
export async function fetchStatementsFromFirestore(companyId: string): Promise<ConvertedStatement[]> {
  if (!auth.currentUser || !companyId) return [];
  const path = `companies/${companyId}/statements`;
  try {
    const snap = await getDocs(collection(db, 'companies', companyId, 'statements'));
    const list: ConvertedStatement[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as ConvertedStatement);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function saveStatementToFirestore(companyId: string, statement: ConvertedStatement): Promise<void> {
  if (!auth.currentUser || !companyId) return;
  const statementId = statement.id || 'stmt-' + Date.now().toString(36);
  const path = `companies/${companyId}/statements/${statementId}`;
  const { fileBase64, ...rest } = statement;
  const cleanPayload = stripUndefinedDeep({
    ...rest,
    id: statementId,
    companyId,
    hasOriginalFile: Boolean(fileBase64 || rest.hasOriginalFile || rest.sourceDocId),
  });
  try {
    await setDoc(doc(db, 'companies', companyId, 'statements', statementId), cleanPayload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteStatementFromFirestore(companyId: string, statementId: string): Promise<void> {
  if (!auth.currentUser || !companyId || !statementId) return;
  const path = `companies/${companyId}/statements/${statementId}`;
  try {
    await deleteDoc(doc(db, 'companies', companyId, 'statements', statementId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// FIRESTORE: USUÁRIOS E PERMISSÕES (USERS)
// -------------------------------------------------------------
export async function fetchUsersFromFirestore(): Promise<User[]> {
  const path = 'users';
  if (!auth.currentUser) {
    return [];
  }
  try {
    const snap = await getDocs(collection(db, path));
    const list: User[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as User);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function syncUserToFirestore(user: User): Promise<void> {
  if (!auth.currentUser) return;
  const path = `users/${user.id}`;
  try {
    await setDoc(doc(db, 'users', user.id), stripUndefinedDeep(user), { merge: true });

    const normEmail = (user.email || '').toLowerCase().trim();
    const authEmail = (auth.currentUser.email || '').toLowerCase().trim();
    if (auth.currentUser.uid && auth.currentUser.uid !== user.id && (!authEmail || authEmail === normEmail)) {
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        stripUndefinedDeep({ ...user, id: auth.currentUser.uid }),
        { merge: true }
      ).catch(() => {});
    }

    // Apenas o Administrador Master é registrado em /admins para validação de regras globais
    if (normEmail === 'rodrigobento1979@gmail.com' || normEmail === 'contsuitesistemas@gmail.com') {
      await setDoc(doc(db, 'admins', user.id), {
        email: user.email,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      if (auth.currentUser.uid && auth.currentUser.uid !== user.id) {
        await setDoc(doc(db, 'admins', auth.currentUser.uid), {
          email: user.email,
          createdAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirestore(userId: string): Promise<void> {
  if (!auth.currentUser || !userId) return;
  const path = `users/${userId}`;
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// FIRESTORE: ARQUIVOS CONTÁBEIS (COMPANY DOCUMENTS)
// -------------------------------------------------------------
export async function fetchDocumentsFromFirestore(companyId: string): Promise<CompanyDocument[]> {
  if (!auth.currentUser || !companyId) return [];
  const path = `companies/${companyId}/documents`;
  try {
    const snap = await getDocs(collection(db, 'companies', companyId, 'documents'));
    const list: CompanyDocument[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as CompanyDocument);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

const ALLOWED_DOC_KEYS = [
  'id',
  'companyId',
  'fileName',
  'mimeType',
  'fileSize',
  'category',
  'status',
  'competenceMonth',
  'documentDate',
  'issuerOrBank',
  'documentNumber',
  'amount',
  'detectedCnpj',
  'summary',
  'aiClassified',
  'confidence',
  'notes',
  'uploadedBy',
  'uploadedAt',
  'updatedAt',
  'ofxStatus',
  'ofxStatementId',
  'ofxError',
  'sourceGroupLabel',
] as const;

export async function saveDocumentBinaryToFirestore(
  companyId: string,
  documentId: string,
  base64Data: string,
  mimeType: string = 'application/pdf'
): Promise<void> {
  if (!auth.currentUser || !companyId || !documentId || !base64Data) return;
  const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!cleanB64) return;

  const CHUNK_SIZE = 600000;
  const totalChunks = Math.ceil(cleanB64.length / CHUNK_SIZE);
  if (totalChunks <= 0 || totalChunks > 40) return;

  try {
    for (let i = 0; i < totalChunks; i++) {
      const chunkId = `chunk-${i}`;
      const slice = cleanB64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await setDoc(
        doc(db, 'companies', companyId, 'documents', documentId, 'chunks', chunkId),
        {
          id: chunkId,
          companyId: String(companyId).slice(0, 100),
          documentId: String(documentId).slice(0, 128),
          index: i,
          totalChunks,
          mimeType: String(mimeType || 'application/pdf').slice(0, 120),
          data: slice,
        }
      );
    }
  } catch (error) {
    console.warn('Firestore save binary chunk warning:', error);
  }
}

export async function fetchDocumentBinaryFromFirestore(
  companyId: string,
  documentId: string
): Promise<string | null> {
  if (!auth.currentUser || !companyId || !documentId) return null;
  try {
    const snap = await getDocs(
      collection(db, 'companies', companyId, 'documents', documentId, 'chunks')
    );
    if (snap.empty) return null;
    const chunks: { index: number; data: string }[] = [];
    snap.forEach((d) => {
      const val = d.data() as any;
      if (typeof val?.index === 'number' && typeof val?.data === 'string') {
        chunks.push({ index: val.index, data: val.data });
      }
    });
    if (chunks.length === 0) return null;
    chunks.sort((a, b) => a.index - b.index);
    return chunks.map((c) => c.data).join('');
  } catch (error) {
    console.warn('Firestore fetch binary chunk warning:', error);
    return null;
  }
}

export async function saveDocumentToFirestore(companyId: string, documentData: CompanyDocument): Promise<void> {
  if (!auth.currentUser || !companyId || !documentData?.id) return;
  const path = `companies/${companyId}/documents/${documentData.id}`;
  const rawB64 = documentData.fileBase64;
  const cleanPayload: Record<string, any> = {
    id: String(documentData.id).slice(0, 128),
    companyId: String(companyId).slice(0, 100),
    fileName: String(documentData.fileName || 'documento.pdf').slice(0, 200),
    mimeType: String(documentData.mimeType || 'application/octet-stream').slice(0, 120),
    fileSize: Math.max(0, Math.round(Number(documentData.fileSize || 0))),
    category: documentData.category || 'outro',
    status: documentData.status || 'pendente',
    competenceMonth: String(documentData.competenceMonth || new Date().toISOString().slice(0, 7)).slice(0, 7),
    aiClassified: Boolean(documentData.aiClassified),
  };

  for (const key of ALLOWED_DOC_KEYS) {
    if (cleanPayload[key] !== undefined) continue;
    const val = (documentData as any)[key];
    if (val === undefined || val === null || val === '') continue;
    if (key === 'confidence') {
      const num = Math.max(0, Math.min(100, Math.round(Number(val))));
      if (!isNaN(num)) cleanPayload[key] = num;
    } else if (key === 'amount') {
      const num = Number(val);
      if (!isNaN(num)) cleanPayload[key] = num;
    } else if (key === 'documentDate') {
      cleanPayload[key] = String(val).slice(0, 10);
    } else if (key === 'issuerOrBank' || key === 'sourceGroupLabel') {
      cleanPayload[key] = String(val).slice(0, 120);
    } else if (key === 'documentNumber') {
      cleanPayload[key] = String(val).slice(0, 60);
    } else if (key === 'detectedCnpj') {
      cleanPayload[key] = String(val).slice(0, 25);
    } else if (key === 'summary' || key === 'ofxError') {
      cleanPayload[key] = String(val).slice(0, 250);
    } else if (key === 'notes') {
      cleanPayload[key] = String(val).slice(0, 500);
    } else if (key === 'uploadedBy') {
      cleanPayload[key] = String(val).slice(0, 150);
    } else if (key === 'uploadedAt' || key === 'updatedAt') {
      cleanPayload[key] = String(val).slice(0, 40);
    } else if (key === 'ofxStatementId') {
      cleanPayload[key] = String(val).slice(0, 100);
    } else {
      cleanPayload[key] = val;
    }
  }

  try {
    await setDoc(doc(db, 'companies', companyId, 'documents', documentData.id), stripUndefinedDeep(cleanPayload), { merge: true });
    if (rawB64) {
      await saveDocumentBinaryToFirestore(companyId, documentData.id, rawB64, cleanPayload.mimeType);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDocumentFromFirestore(
  companyId: string,
  documentId: string
): Promise<boolean> {
  if (!auth.currentUser || !companyId || !documentId) return false;
  const path = `companies/${companyId}/documents/${documentId}`;
  try {
    // 1. Delete all binary chunks inside the subcollection first so no orphan storage remains
    try {
      const chunksSnap = await getDocs(
        collection(db, 'companies', companyId, 'documents', documentId, 'chunks')
      );
      if (!chunksSnap.empty) {
        await Promise.all(chunksSnap.docs.map((chunkDoc) => deleteDoc(chunkDoc.ref)));
      }
    } catch (chunkErr: any) {
      if (chunkErr?.code !== 'not-found') {
        console.warn('Firestore delete chunks warning:', chunkErr);
      }
    }

    // 2. Delete the document metadata itself
    await deleteDoc(doc(db, 'companies', companyId, 'documents', documentId));
    return true;
  } catch (error: any) {
    if (error?.code === 'not-found') {
      return true;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
    return false;
  }
}

export function subscribeDocumentsFromFirestore(
  companyId: string,
  onDocs: (docs: CompanyDocument[]) => void
): () => void {
  if (!auth.currentUser || !companyId) return () => {};
  const colRef = collection(db, 'companies', companyId, 'documents');
  return onSnapshot(
    colRef,
    (snap) => {
      const list: CompanyDocument[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as CompanyDocument);
      });
      onDocs(list);
    },
    (error) => {
      console.warn('Firestore documents realtime listener warning:', error);
    }
  );
}

export async function fetchAllCompaniesDocumentsFromFirestore(
  companyIds: string[]
): Promise<CompanyDocument[]> {
  if (!auth.currentUser || !Array.isArray(companyIds) || companyIds.length === 0) return [];
  const results = await Promise.all(
    companyIds
      .filter((id) => Boolean(id && id.trim()))
      .map((id) => fetchDocumentsFromFirestore(id).catch(() => [] as CompanyDocument[]))
  );
  return results.flat();
}

export async function moveDocumentInFirestore(
  fromCompanyId: string,
  toCompanyId: string,
  documentData: CompanyDocument
): Promise<void> {
  if (!auth.currentUser || !fromCompanyId || !toCompanyId || !documentData?.id) return;
  if (fromCompanyId === toCompanyId) return;

  let b64 = documentData.fileBase64;
  if (!b64) {
    try {
      const fetched = await fetchDocumentBinaryFromFirestore(fromCompanyId, documentData.id);
      if (fetched) b64 = fetched;
    } catch {}
  }

  const movedDoc: CompanyDocument = {
    ...documentData,
    companyId: toCompanyId,
    fileBase64: b64,
    hasOriginalFile: Boolean(b64 || documentData.hasOriginalFile),
    updatedAt: new Date().toISOString(),
  };

  await saveDocumentToFirestore(toCompanyId, movedDoc);

  // Clean up old chunks & document metadata in the source company
  try {
    const oldChunksSnap = await getDocs(
      collection(db, 'companies', fromCompanyId, 'documents', documentData.id, 'chunks')
    );
    for (const chunkDoc of oldChunksSnap.docs) {
      await deleteDoc(chunkDoc.ref).catch(() => {});
    }
  } catch {}

  await deleteDocumentFromFirestore(fromCompanyId, documentData.id);
}

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where 
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
import { User, Company, Asset, ConvertedStatement } from '../types';

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
    await setDoc(doc(db, 'companies', company.id), company, { merge: true });
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
      list.push({ id: d.id, ...d.data() } as Asset);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function saveAssetToFirestore(companyId: string, asset: Asset): Promise<void> {
  if (!auth.currentUser || !companyId) return;
  const path = `companies/${companyId}/assets/${asset.id}`;
  try {
    await setDoc(doc(db, 'companies', companyId, 'assets', asset.id), asset, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAssetFromFirestore(companyId: string, assetId: string): Promise<void> {
  if (!auth.currentUser || !companyId) return;
  const path = `companies/${companyId}/assets/${assetId}`;
  try {
    await deleteDoc(doc(db, 'companies', companyId, 'assets', assetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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
  try {
    await setDoc(doc(db, 'companies', companyId, 'statements', statementId), {
      ...statement,
      id: statementId,
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
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
    await setDoc(doc(db, 'users', user.id), user, { merge: true });

    // Se for admin, registra também em /admins para validação de regras de segurança
    if (user.role === 'admin' || user.email === 'rodrigobento1979@gmail.com') {
      await setDoc(doc(db, 'admins', user.id), {
        email: user.email,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

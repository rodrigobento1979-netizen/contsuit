import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { AssetsView } from './components/AssetsView';
import { AssetModal } from './components/AssetModal';
import { DepreciationView } from './components/DepreciationView';
import { OfxConverterView } from './components/OfxConverterView';
import { AdminUsersView } from './components/AdminUsersView';
import { UserProfileModal } from './components/UserProfileModal';
import { CompanyModal } from './components/CompanyModal';
import { AiGuideHomeView } from './components/AiGuideHomeView';
import { HonorariosView } from './components/HonorariosView';
import { ChartOfAccountsView } from './components/ChartOfAccountsView';
import { DatabaseView } from './components/DatabaseView';
import { CompaniesView } from './components/CompaniesView';
import { DocumentsView } from './components/DocumentsView';
import { Sidebar, AppNavTab } from './components/Sidebar';
import { HelpCenterModal } from './components/HelpCenterModal';
import { DocumentScannerModal } from './components/DocumentScannerModal';
import { AssetSmartImportModal } from './components/AssetSmartImportModal';
import { OfxAgentProvider } from './context/OfxAgentContext';
import { User, Company, CompanyDocument, Asset, DepreciationSummary, ConvertedStatement } from './types';
import { isMasterUser, filterCompaniesForUser } from './utils/auth';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { 
  loginWithGoogle, 
  logoutFirebase, 
  subscribeToAuth,
  saveCompanyToFirestore,
  fetchCompaniesFromFirestore,
  fetchAssetsFromFirestore,
  saveAssetToFirestore,
  deleteAssetFromFirestore,
  saveStatementToFirestore,
  fetchStatementsFromFirestore,
  deleteStatementFromFirestore,
  fetchDocumentsFromFirestore,
  syncUserToFirestore,
  fetchUsersFromFirestore,
  deleteUserFromFirestore
} from './firebase/service';

const SESSION_USER_KEY = 'contsuite_session_user';
const SESSION_COMPANY_KEY = 'contsuite_session_company';

const NEUTRAL_GUEST_USER: User = {
  id: '',
  name: 'Usuário',
  email: '',
  role: 'client',
  companyId: '',
  createdAt: '',
  status: 'active',
};

const NEUTRAL_EMPTY_COMPANY: Company = {
  id: '',
  name: 'Nenhuma empresa vinculada',
  cnpj: '00.000.000/0000-00',
  fantasyName: 'Sem Empresa Selecionada',
  contactEmail: '',
  phone: '',
  accountingSystem: 'dominio',
  createdAt: '',
};

export default function App() {
  // Restore persisted session accurately instead of defaulting to Master
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('contsuite_logged_in') === 'true';
  });

  // Default tab is 'home' so the user is greeted by the AI agent without entering any raw tables
  const [activeTab, setActiveTab] = useState<AppNavTab>('home');

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      if (localStorage.getItem('contsuite_logged_in') === 'true') {
        const raw = localStorage.getItem(SESSION_USER_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.email) return parsed;
        }
      }
    } catch {}
    return NEUTRAL_GUEST_USER;
  });

  const [currentCompany, setCurrentCompany] = useState<Company>(() => {
    try {
      if (localStorage.getItem('contsuite_logged_in') === 'true') {
        const rawUser = localStorage.getItem(SESSION_USER_KEY);
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const rawComp = localStorage.getItem(SESSION_COMPANY_KEY);
        if (rawComp) {
          const parsedComp = JSON.parse(rawComp);
          if (parsedComp && parsedComp.id) {
            if (parsedComp.id !== 'comp-master' || isMasterUser(parsedUser)) {
              return parsedComp;
            }
          }
        }
      }
    } catch {}
    return NEUTRAL_EMPTY_COMPANY;
  });

  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allUsers, setAllUsers] = useState<(User & { company?: Company })[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depreciationSummary, setDepreciationSummary] = useState<DepreciationSummary | null>(null);
  const [statements, setStatements] = useState<ConvertedStatement[]>([]);

  // Firebase auth user & readiness
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const firebaseUid = firebaseUser?.uid || '';

  // Period for depreciation
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');

  // Modals
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<Asset | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<Company | null>(null);
  const [companyPrefill, setCompanyPrefill] = useState<{ name?: string; cnpj?: string; fantasyName?: string } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isAssetSmartImportOpen, setIsAssetSmartImportOpen] = useState(false);
  const [pendingOfxFile, setPendingOfxFile] = useState<File | null>(null);
  const [pendingScannedDoc, setPendingScannedDoc] = useState<CompanyDocument | null>(null);

  const handleOpenCompanyModalWithPrefill = (prefill: { name?: string; cnpj?: string; fantasyName?: string }) => {
    setCompanyToEdit(null);
    setCompanyPrefill(prefill);
    setIsCompanyModalOpen(true);
  };

  const handleOpenNewCompanyModal = () => {
    setCompanyToEdit(null);
    setCompanyPrefill(null);
    setIsCompanyModalOpen(true);
  };

  // Global Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);

  // Synchronize document title and icon in browser tab
  useEffect(() => {
    document.title = 'ContSuite v1.0 - Sistema Contábil';
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const currentCompanyIdRef = useRef(currentCompany.id);
  useEffect(() => {
    currentCompanyIdRef.current = currentCompany.id;
  }, [currentCompany.id]);

  const isAuthenticatedRef = useRef(isAuthenticated);
  const currentUserEmailRef = useRef(currentUser.email);
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    currentUserEmailRef.current = currentUser.email;
  }, [isAuthenticated, currentUser.email]);

  // Resilient fetch wrapper for transient dev-server restarts or cold starts
  const fetchWithRetry = useCallback(async (
    input: RequestInfo | URL,
    init?: RequestInit,
    retries = 2,
    delayMs = 500
  ): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(input, { cache: 'no-store', ...init });
        if (res.status >= 502 && res.status <= 504 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }, []);

  // Safe JSON response parser that prevents crashes when servers return HTML 404 or text errors
  const safeJson = async <T,>(res: Response): Promise<T | null> => {
    try {
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.warn('API returned non-JSON response:', text.slice(0, 80));
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      console.warn('Failed parsing JSON from response:', e);
      return null;
    }
  };

  // Persist active session user & company across reloads (never leak between accounts)
  useEffect(() => {
    if (!isAuthenticated || !currentUser.email) return;
    try {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
      if (currentCompany && currentCompany.id) {
        if (currentCompany.id !== 'comp-master' || isMasterUser(currentUser)) {
          localStorage.setItem(SESSION_COMPANY_KEY, JSON.stringify(currentCompany));
        }
      }
    } catch {}
  }, [isAuthenticated, currentUser, currentCompany]);

  // Enforce Master-only route guard
  useEffect(() => {
    if (isAuthenticated && currentUser.email && !isMasterUser(currentUser)) {
      if (activeTab === 'admin' || activeTab === 'database') {
        setActiveTab('home');
      }
    }
  }, [isAuthenticated, currentUser, activeTab]);

  const masterMirrorSyncedRef = useRef<string | null>(null);

  // 1. Fetch Companies and Users (Somente Usuário Master vê TODAS as empresas; demais usuários veem apenas suas próprias empresas)
  const fetchCompaniesAndUsers = useCallback(async () => {
    if (!isAuthenticated || !currentUser.email) {
      setAllCompanies([]);
      return;
    }

    const normCurrentEmail = (currentUser.email || '').toLowerCase().trim();
    const canViewAllCompanies = isMasterUser(currentUser);

    let apiComps: Company[] = [];
    let apiUsers: User[] = [];
    try {
      const companyUrl = canViewAllCompanies
        ? `/api/companies?role=admin&email=${encodeURIComponent(normCurrentEmail)}`
        : `/api/companies?role=client&companyId=${encodeURIComponent(currentUser.companyId || '')}&userId=${encodeURIComponent(currentUser.id || '')}&email=${encodeURIComponent(normCurrentEmail)}`;

      const [compRes, usersRes] = await Promise.all([
        fetchWithRetry(companyUrl),
        fetchWithRetry('/api/users'),
      ]);

      apiComps = (await safeJson<Company[]>(compRes)) || [];
      apiUsers = (await safeJson<User[]>(usersRes)) || [];
    } catch (err) {
      console.warn('API temporarily unreachable when fetching companies/users, using cache/Firestore:', err);
    }

    // Fetch from Firestore in parallel for bulletproof resilience
    let firestoreUsers: User[] = [];
    let firestoreCompanies: Company[] = [];
    try {
      const [fUsers, fComps] = await Promise.all([
        fetchUsersFromFirestore(),
        fetchCompaniesFromFirestore(),
      ]);
      firestoreUsers = fUsers || [];
      firestoreCompanies = fComps || [];
    } catch (fErr) {
      console.warn('Could not load users/companies from Firestore:', fErr);
    }

    // Read cached users early so we can also recover embedded company records
    let localUsers: User[] = [];
    try {
      const cached = localStorage.getItem('contsuite_cached_users');
      if (cached) localUsers = JSON.parse(cached);
    } catch {}

    // Merge Companies from API, Firestore, user records, and LocalStorage
    let localComps: Company[] = [];
    if (canViewAllCompanies) {
      try {
        const cached = localStorage.getItem('contsuite_cached_companies');
        if (cached) localComps = JSON.parse(cached);
      } catch {}
    }

    const userEmbeddedCompanies: Company[] = canViewAllCompanies
      ? [...apiUsers, ...firestoreUsers, ...localUsers]
          .map((u: any) => u?.company)
          .filter((c: any): c is Company => Boolean(c && c.id))
      : [...apiUsers, ...firestoreUsers, ...localUsers]
          .filter((u: any) => {
            const uEmail = (u?.email || '').toLowerCase().trim();
            return (
              (normCurrentEmail && uEmail === normCurrentEmail) ||
              (currentUser.id && u?.id === currentUser.id)
            );
          })
          .map((u: any) => u?.company)
          .filter((c: any): c is Company => Boolean(c && c.id && c.id !== 'comp-master'));

    const compMap = new Map<string, Company>();
    const rawCompanySources = canViewAllCompanies
      ? [...localComps, ...userEmbeddedCompanies, ...firestoreCompanies, ...apiComps]
      : filterCompaniesForUser(
          [...userEmbeddedCompanies, ...firestoreCompanies, ...apiComps],
          currentUser
        );

    rawCompanySources.forEach(c => {
      if (c && c.id) {
        compMap.set(c.id, { ...compMap.get(c.id), ...c });
      }
    });
    const mergedComps = Array.from(compMap.values());

    // Merge Users from API, Firestore, and LocalStorage
    const userMap = new Map<string, any>();
    [...apiUsers, ...firestoreUsers, ...localUsers].forEach(u => {
      if (u && (u.id || u.email)) {
        const key = (u.email || u.id).toLowerCase().trim();
        const existing = userMap.get(key) || {};
        userMap.set(key, { ...existing, ...u });
      }
    });

    const mergedUsers = Array.from(userMap.values()).map(u => ({
      ...u,
      company: mergedComps.find(c => c.id === u.companyId) || u.company,
    }));

    if (mergedUsers.length > 0) {
      setAllUsers(mergedUsers);
      try {
        localStorage.setItem('contsuite_cached_users', JSON.stringify(mergedUsers));
      } catch {}
    }

    // 2-way sync for Master Admin so companies, users, documents, assets & statements sync from Firestore to db.json
    if (canViewAllCompanies && mergedComps.length > 0) {
      const apiIds = new Set(apiComps.map(c => c.id));
      const missingInApi = mergedComps.filter(c => !apiIds.has(c.id));
      if (missingInApi.length > 0 || mergedUsers.length > 0) {
        fetch('/api/database/sync-mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companies: missingInApi.length > 0 ? mergedComps : [],
            users: mergedUsers,
          }),
        }).catch(() => {});
      }

      const firestoreIds = new Set(firestoreCompanies.map(c => c.id));
      const missingInFirestore = mergedComps.filter(c => !firestoreIds.has(c.id));
      if (missingInFirestore.length > 0) {
        missingInFirestore.forEach(c => {
          saveCompanyToFirestore(c).catch(() => {});
        });
      }

      // Mirror subcollections from Firestore -> API once per Master session when Firestore is populated
      if (masterMirrorSyncedRef.current !== normCurrentEmail && firestoreCompanies.length > 0) {
        masterMirrorSyncedRef.current = normCurrentEmail;
        Promise.all(
          mergedComps.map(async (comp) => {
            try {
              const [fDocs, fAssets, fStmts] = await Promise.all([
                fetchDocumentsFromFirestore(comp.id).catch(() => []),
                fetchAssetsFromFirestore(comp.id).catch(() => []),
                fetchStatementsFromFirestore(comp.id).catch(() => []),
              ]);
              if (fDocs.length > 0 || fAssets.length > 0 || fStmts.length > 0) {
                await fetch('/api/database/sync-mirror', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    documents: fDocs,
                    assets: fAssets,
                    statements: fStmts,
                  }),
                }).catch(() => {});
              }
            } catch {}
          })
        ).catch(() => {});
      }
    } else if (!canViewAllCompanies && mergedComps.length > 0) {
      // Ensure client's own company/user from Firestore/cache is mirrored into API too
      const apiCompIds = new Set(apiComps.map(c => c.id));
      const clientMissing = mergedComps.filter(c => !apiCompIds.has(c.id));
      if (clientMissing.length > 0) {
        fetch('/api/database/sync-mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companies: clientMissing,
            users: [{ ...currentUser, companyId: mergedComps[0].id }],
          }),
        }).catch(() => {});
      }
    }

    if (canViewAllCompanies) {
      if (mergedComps.length > 0) {
        setAllCompanies(mergedComps);
        try {
          localStorage.setItem('contsuite_cached_companies', JSON.stringify(mergedComps));
        } catch {}

        const found = mergedComps.find(c => c.id === currentCompanyIdRef.current);
        if (found) {
          setCurrentCompany(found);
        } else if (firebaseAuthReady || !currentCompanyIdRef.current) {
          setCurrentCompany(mergedComps[0]);
        }
      }
    } else {
      // Strict isolation for non-Master users: NEVER retain Master's companies in state
      if (mergedComps.length > 0) {
        setAllCompanies(mergedComps);
        const found = mergedComps.find(c => c.id === currentCompanyIdRef.current);
        if (found && found.id !== 'comp-master') {
          setCurrentCompany(found);
        } else {
          setCurrentCompany(mergedComps[0]);
          if (currentUser.companyId !== mergedComps[0].id) {
            setCurrentUser(prev => ({ ...prev, companyId: mergedComps[0].id }));
          }
        }
      } else if (firebaseAuthReady || !currentCompanyIdRef.current || currentCompanyIdRef.current === 'comp-master') {
        setAllCompanies([]);
        setCurrentCompany(NEUTRAL_EMPTY_COMPANY);
      }
    }
  }, [isAuthenticated, currentUser.role, currentUser.companyId, currentUser.id, currentUser.email, firebaseUid, firebaseAuthReady, fetchWithRetry]);

  // 2. Fetch Assets for current company (Merges API + Firestore + LocalStorage + auto-mirrors)
  const fetchAssets = useCallback(async () => {
    const companyId = currentCompany.id;
    if (!companyId) {
      setAssets([]);
      return;
    }

    let apiAssets: Asset[] = [];
    try {
      const res = await fetchWithRetry(`/api/assets?companyId=${companyId}`);
      const data = await safeJson<Asset[]>(res);
      if (data && Array.isArray(data)) {
        apiAssets = data;
      }
    } catch (err) {
      console.warn('Could not fetch assets from API right now:', err);
    }

    let firestoreAssets: Asset[] = [];
    try {
      firestoreAssets = await fetchAssetsFromFirestore(companyId);
    } catch (err) {
      console.warn('Could not fetch assets from Firestore:', err);
    }

    let localAssets: Asset[] = [];
    try {
      const raw = localStorage.getItem(`contsuite_cached_assets_${companyId}`);
      if (raw) localAssets = JSON.parse(raw);
    } catch {}

    const map = new Map<string, Asset>();
    [...localAssets, ...firestoreAssets, ...apiAssets].forEach((a) => {
      if (a && a.id && (!a.companyId || a.companyId === companyId)) {
        map.set(a.id, { ...map.get(a.id), ...a, companyId });
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    setAssets(merged);

    try {
      localStorage.setItem(`contsuite_cached_assets_${companyId}`, JSON.stringify(merged));
    } catch {}

    // Mirror Firestore/local assets missing from API back to db.json
    const apiAssetIds = new Set(apiAssets.map(a => a.id));
    const missingInApi = merged.filter(a => !apiAssetIds.has(a.id));
    if (missingInApi.length > 0) {
      fetch('/api/database/sync-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: missingInApi }),
      }).catch(() => {});
    }

    // Also push local/API assets missing from Firestore up to the cloud when Firebase Auth is active
    if (firebaseUid) {
      const fAssetIds = new Set(firestoreAssets.map(a => a.id));
      const missingInFirestore = merged.filter(a => !fAssetIds.has(a.id));
      missingInFirestore.forEach(a => {
        saveAssetToFirestore(companyId, a).catch(() => {});
      });
    }
  }, [currentCompany.id, firebaseUid, fetchWithRetry]);

  // 3. Fetch Depreciation Summary for current company & month
  const fetchDepreciation = useCallback(async () => {
    if (!currentCompany.id) {
      setDepreciationSummary(null);
      return;
    }
    try {
      const res = await fetchWithRetry(`/api/assets/depreciation?companyId=${currentCompany.id}&month=${selectedMonth}`);
      const data = await safeJson<DepreciationSummary>(res);
      if (data) {
        setDepreciationSummary(data);
      }
    } catch (err) {
      console.warn('Could not fetch depreciation right now:', err);
    }
  }, [currentCompany.id, selectedMonth, fetchWithRetry]);

  // 4. Fetch Converted Statements (Merges API + Firestore + LocalStorage + auto-mirrors)
  const fetchStatements = useCallback(async () => {
    const companyId = currentCompany.id;
    if (!companyId) {
      setStatements([]);
      return;
    }

    let apiStmts: ConvertedStatement[] = [];
    try {
      const res = await fetchWithRetry(`/api/ofx/history?companyId=${companyId}`);
      const data = await safeJson<ConvertedStatement[]>(res);
      if (data && Array.isArray(data)) {
        apiStmts = data;
      }
    } catch (err) {
      console.warn('Could not fetch statements from API right now:', err);
    }

    let firestoreStmts: ConvertedStatement[] = [];
    try {
      firestoreStmts = await fetchStatementsFromFirestore(companyId);
    } catch (err) {
      console.warn('Could not fetch statements from Firestore:', err);
    }

    let localStmts: ConvertedStatement[] = [];
    try {
      const raw = localStorage.getItem(`contsuite_cached_statements_${companyId}`);
      if (raw) localStmts = JSON.parse(raw);
    } catch {}

    let deletedIds = new Set<string>();
    try {
      const rawDel = localStorage.getItem(`contsuite_deleted_statements_${companyId}`);
      if (rawDel) deletedIds = new Set<string>(JSON.parse(rawDel));
    } catch {}

    const map = new Map<string, ConvertedStatement>();
    [...localStmts, ...firestoreStmts, ...apiStmts].forEach((s) => {
      if (!s || !s.id) return;
      if (deletedIds.has(s.id)) return;
      if (s.companyId && s.companyId !== companyId) return;
      const existing = map.get(s.id);
      map.set(s.id, {
        ...existing,
        ...s,
        companyId: s.companyId || companyId,
        hasOriginalFile: Boolean(s.hasOriginalFile || existing?.hasOriginalFile || s.sourceDocId || existing?.sourceDocId),
      });
    });

    const merged = Array.from(map.values()).sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return tb - ta;
    });

    setStatements(merged);
    try {
      localStorage.setItem(
        `contsuite_cached_statements_${companyId}`,
        JSON.stringify(merged.map(({ fileBase64, ...rest }) => rest))
      );
    } catch {}

    // Mirror Firestore/local statements missing from API back to db.json
    const apiStmtIds = new Set(apiStmts.map(s => s.id));
    const missingInApi = merged.filter(s => !apiStmtIds.has(s.id));
    if (missingInApi.length > 0) {
      fetch('/api/database/sync-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements: missingInApi }),
      }).catch(() => {});
    }

    // Also push API/local statements missing from Firestore up to the cloud when Firebase Auth is active
    if (firebaseUid) {
      const fStmtIds = new Set(firestoreStmts.map(s => s.id));
      const missingInFirestore = merged.filter(s => !fStmtIds.has(s.id));
      missingInFirestore.forEach(s => {
        saveStatementToFirestore(companyId, s).catch(() => {});
      });
    }
  }, [currentCompany.id, firebaseUid, fetchWithRetry]);

  const handleStatementCreated = useCallback((stmt: ConvertedStatement) => {
    if (!stmt || !stmt.id) return;
    const targetCompanyId = stmt.companyId || currentCompanyIdRef.current;
    const { fileBase64, ...compact } = stmt;
    const normalized: ConvertedStatement = {
      ...compact,
      companyId: targetCompanyId,
      hasOriginalFile: Boolean(fileBase64 || compact.hasOriginalFile || compact.sourceDocId),
    };

    try {
      const delRaw = localStorage.getItem(`contsuite_deleted_statements_${targetCompanyId}`);
      if (delRaw) {
        const nextDel = (JSON.parse(delRaw) as string[]).filter((id) => id !== normalized.id);
        localStorage.setItem(`contsuite_deleted_statements_${targetCompanyId}`, JSON.stringify(nextDel));
      }
    } catch {}

    if (targetCompanyId === currentCompanyIdRef.current) {
      setStatements((prev) => [normalized, ...prev.filter((s) => s.id !== normalized.id)]);
    }
  }, []);

  const handleStatementDeleted = useCallback(async (statementId: string) => {
    const companyId = currentCompanyIdRef.current;
    if (!companyId || !statementId) return;

    setStatements((prev) => prev.filter((s) => s.id !== statementId));
    try {
      const cacheKey = `contsuite_cached_statements_${companyId}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const next = (JSON.parse(raw) as ConvertedStatement[]).filter((s) => s.id !== statementId);
        localStorage.setItem(cacheKey, JSON.stringify(next));
      }
      const delKey = `contsuite_deleted_statements_${companyId}`;
      const rawDel = localStorage.getItem(delKey);
      const delArr: string[] = rawDel ? JSON.parse(rawDel) : [];
      if (!delArr.includes(statementId)) {
        localStorage.setItem(delKey, JSON.stringify([statementId, ...delArr].slice(0, 200)));
      }
    } catch {}

    try {
      await deleteStatementFromFirestore(companyId, statementId);
    } catch {}
  }, []);

  const initialLoadDoneRef = useRef(false);

  // Initial load & refresh whenever auth state or currentUser profile changes
  useEffect(() => {
    const init = async () => {
      if (!isAuthenticated || !currentUser.email) {
        if (!initialLoadDoneRef.current) {
          initialLoadDoneRef.current = true;
          setLoading(false);
        }
        return;
      }
      if (!initialLoadDoneRef.current) {
        setLoading(true);
      }
      await fetchCompaniesAndUsers();
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;
        setLoading(false);
      }
    };
    init();
  }, [fetchCompaniesAndUsers, isAuthenticated, currentUser.email]);

  // Listen to Firebase Authentication state once on mount
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      setFirebaseUser(user);
      setFirebaseAuthReady(true);

      if (user && user.email) {
        const normEmail = user.email.toLowerCase().trim();
        const authMode = localStorage.getItem('contsuite_auth_mode');
        const wasLoggedInSameEmail =
          isAuthenticatedRef.current &&
          currentUserEmailRef.current?.toLowerCase().trim() === normEmail;

        // If user explicitly logged in via Email/Company (e.g. SSCONT), do not overwrite with another Google session
        if (
          authMode === 'email' &&
          isAuthenticatedRef.current &&
          currentUserEmailRef.current &&
          currentUserEmailRef.current.toLowerCase().trim() !== normEmail
        ) {
          return;
        }

        const isMasterEmail = isMasterUser({ email: normEmail });

        let resolvedRole: User['role'] = isMasterEmail ? 'admin' : 'client';
        let resolvedCompanyId = isMasterEmail ? 'comp-master' : '';
        let resolvedName = user.displayName || user.email.split('@')[0];
        let matchedCompany: Company | null = null;
        let candidateCompanies: Company[] = [];

        if (!isMasterEmail) {
          // 1. Check backend /api/auth/login
          try {
            const loginRes = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: normEmail }),
            });
            if (loginRes.ok) {
              const loginData = await loginRes.json();
              if (loginData?.user?.role) resolvedRole = loginData.user.role;
              if (loginData?.user?.name) resolvedName = loginData.user.name;
              if (loginData?.user?.companyId && loginData.user.companyId !== 'comp-master') {
                resolvedCompanyId = loginData.user.companyId;
              }
              if (Array.isArray(loginData?.companies)) {
                candidateCompanies.push(...loginData.companies);
              }
              if (loginData?.company && loginData.company.id !== 'comp-master') {
                matchedCompany = loginData.company;
                resolvedCompanyId = loginData.company.id;
              }
            }
          } catch {}

          // 2. Also check Firestore & cached users/companies so existing users keep their real companyId
          try {
            const [fUsers, fComps] = await Promise.all([
              fetchUsersFromFirestore().catch(() => []),
              fetchCompaniesFromFirestore().catch(() => []),
            ]);
            const cachedUsersRaw = localStorage.getItem('contsuite_cached_users');
            const cachedUsers: any[] = cachedUsersRaw ? JSON.parse(cachedUsersRaw) : [];

            const matchedUser = [...fUsers, ...cachedUsers].find(
              (u: any) => u?.email?.toLowerCase().trim() === normEmail
            );
            if (matchedUser) {
              if (matchedUser.role && matchedUser.role !== 'admin') resolvedRole = matchedUser.role;
              if (!resolvedCompanyId && matchedUser.companyId && matchedUser.companyId !== 'comp-master') {
                resolvedCompanyId = matchedUser.companyId;
              }
              if (matchedUser.name) resolvedName = matchedUser.name;
              if (matchedUser.company && matchedUser.company.id !== 'comp-master') {
                candidateCompanies.push(matchedUser.company);
              }
            }
            candidateCompanies.push(...fComps);
          } catch {}
        }

        const syncedUser: User = {
          id: user.uid,
          name: resolvedName,
          email: normEmail,
          role: resolvedRole,
          companyId: resolvedCompanyId,
          createdAt: new Date().toISOString(),
          status: 'active',
        };

        if (!isMasterEmail) {
          const allowed = filterCompaniesForUser(candidateCompanies, syncedUser);
          matchedCompany =
            allowed.find(c => c.id === currentCompanyIdRef.current) ||
            allowed.find(c => c.id === resolvedCompanyId) ||
            allowed[0] ||
            matchedCompany;
          if (matchedCompany) {
            syncedUser.companyId = matchedCompany.id;
            setAllCompanies(allowed.length > 0 ? allowed : [matchedCompany]);
            setCurrentCompany(matchedCompany);
            try {
              localStorage.setItem(SESSION_COMPANY_KEY, JSON.stringify(matchedCompany));
            } catch {}
          } else {
            setAllCompanies([]);
            setCurrentCompany(NEUTRAL_EMPTY_COMPANY);
            localStorage.removeItem(SESSION_COMPANY_KEY);
          }
        } else {
          const masterFallback: Company = {
            id: 'comp-master',
            name: 'Bento & Associados Consultoria Contábil',
            cnpj: '12.345.678/0001-90',
            fantasyName: 'Bento Contabilidade',
            contactEmail: 'rodrigobento1979@gmail.com',
            phone: '(11) 98765-4321',
            accountingSystem: 'dominio',
            createdAt: '2026-01-01T08:00:00.000Z',
          };
          setCurrentCompany(prev => (prev.id ? prev : masterFallback));
        }

        setCurrentUser(syncedUser);
        setIsAuthenticated(true);
        if (!wasLoggedInSameEmail) {
          setActiveTab('home');
          showToast(`Conectado com Google: ${normEmail}`);
        }
        localStorage.setItem('contsuite_logged_in', 'true');
        localStorage.setItem('contsuite_auth_mode', 'google');
        try {
          localStorage.setItem(SESSION_USER_KEY, JSON.stringify(syncedUser));
        } catch {}

        try {
          await syncUserToFirestore(syncedUser);
        } catch (e) {
          console.warn('Could not sync user to Firestore:', e);
        }

        fetch('/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: syncedUser, company: matchedCompany }),
        }).catch(() => {});
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login handler with resilient multi-tier lookup (API -> cached users -> Firestore -> companies fallback)
  const handleLogin = async (email: string) => {
    const normInput = email.toLowerCase().trim();
    masterMirrorSyncedRef.current = null;
    localStorage.setItem('contsuite_auth_mode', 'email');
    if (firebaseUser?.email && firebaseUser.email.toLowerCase().trim() !== normInput) {
      logoutFirebase().catch(() => {});
    }

    // 1. Try backend authentication (supports email, username, or company name like SSCONT)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normInput }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const loggedUser: User = data.user;
          const isMaster = isMasterUser(loggedUser);
          const candidateCompanies: Company[] = Array.isArray(data.companies)
            ? data.companies
            : data.company
              ? [data.company]
              : [];
          const scopedCompanies = isMaster
            ? candidateCompanies
            : filterCompaniesForUser(candidateCompanies, loggedUser);
          const targetCompany = isMaster
            ? data.company || scopedCompanies[0] || currentCompany
            : scopedCompanies.find(c => c.id === loggedUser.companyId) ||
              scopedCompanies[0] ||
              (data.company && data.company.id !== 'comp-master' ? data.company : NEUTRAL_EMPTY_COMPANY);

          setCurrentUser(loggedUser);
          setAllCompanies(scopedCompanies);
          setCurrentCompany(targetCompany);
          setIsAuthenticated(true);
          setActiveTab('home');
          localStorage.setItem('contsuite_logged_in', 'true');
          localStorage.setItem(SESSION_USER_KEY, JSON.stringify(loggedUser));
          if (targetCompany.id) {
            localStorage.setItem(SESSION_COMPANY_KEY, JSON.stringify(targetCompany));
          } else {
            localStorage.removeItem(SESSION_COMPANY_KEY);
          }
          showToast(`Bem-vindo ao ContSuite, ${loggedUser.name}!`);
          return;
        }
      }
    } catch (apiErr) {
      console.warn('Backend login attempt error:', apiErr);
    }

    // 2. Resilient fallback: lookup in allUsers, API users, cached users, Firestore, or companies
    let cachedUsers: any[] = [];
    try {
      const cached = localStorage.getItem('contsuite_cached_users');
      if (cached) cachedUsers = JSON.parse(cached);
    } catch {}

    let apiUsers: any[] = [];
    try {
      const uRes = await fetch('/api/users', { cache: 'no-store' });
      if (uRes.ok) apiUsers = await uRes.json();
    } catch {}

    let firestoreUsers: User[] = [];
    try {
      firestoreUsers = await fetchUsersFromFirestore();
    } catch {}

    const userPool = [...allUsers, ...apiUsers, ...cachedUsers, ...firestoreUsers];
    let userCandidate: User | undefined = userPool.find(
      (u: any) =>
        u?.email?.toLowerCase().trim() === normInput ||
        u?.name?.toLowerCase().trim() === normInput ||
        u?.email?.toLowerCase().split('@')[0] === normInput
    );

    // Collect candidate companies to resolve ownership cleanly
    let cachedComps: Company[] = [];
    try {
      const rawC = localStorage.getItem('contsuite_cached_companies');
      if (rawC) cachedComps = JSON.parse(rawC);
    } catch {}

    let compPool: Company[] = [...allCompanies, ...cachedComps];
    try {
      const fComps = await fetchCompaniesFromFirestore();
      compPool = [...compPool, ...fComps];
    } catch {}
    userPool.forEach((u: any) => {
      if (u?.company?.id) compPool.push(u.company);
    });

    if (!userCandidate) {
      const matchedComp = compPool.find(
        c =>
          c.id !== 'comp-master' &&
          (c.fantasyName?.toLowerCase().trim() === normInput ||
            c.name?.toLowerCase().trim() === normInput ||
            c.createdByEmail?.toLowerCase().trim() === normInput ||
            c.contactEmail?.toLowerCase().trim() === normInput)
      );
      if (matchedComp) {
        const recoveredEmail = (
          matchedComp.createdByEmail ||
          matchedComp.contactEmail ||
          (normInput.includes('@') ? normInput : '')
        )
          .toLowerCase()
          .trim();
        if (recoveredEmail) {
          userCandidate = {
            id: matchedComp.createdByUserId || 'usr-' + Date.now().toString(36),
            name: matchedComp.createdByName || matchedComp.fantasyName || recoveredEmail.split('@')[0],
            email: recoveredEmail,
            role: 'client',
            companyId: matchedComp.id,
            createdAt: new Date().toISOString(),
            status: 'active',
          };
        }
      }
    }

    if (userCandidate) {
      const isMaster = isMasterUser(userCandidate);
      const activeUser: User = { ...userCandidate, status: 'active' };
      const scopedCompanies = isMaster
        ? compPool
        : filterCompaniesForUser(compPool, activeUser);
      const comp = isMaster
        ? scopedCompanies.find(c => c.id === activeUser.companyId) || scopedCompanies[0]
        : scopedCompanies.find(c => c.id === activeUser.companyId) || scopedCompanies[0];

      if (comp && !isMaster) {
        activeUser.companyId = comp.id;
      }

      // Sync user & company to backend server
      try {
        await fetch('/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: activeUser, company: comp }),
        });
      } catch {}

      setCurrentUser(activeUser);
      setAllCompanies(scopedCompanies);
      setCurrentCompany(comp || NEUTRAL_EMPTY_COMPANY);
      setIsAuthenticated(true);
      setActiveTab('home');
      localStorage.setItem('contsuite_logged_in', 'true');
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(activeUser));
      if (comp?.id) {
        localStorage.setItem(SESSION_COMPANY_KEY, JSON.stringify(comp));
      } else {
        localStorage.removeItem(SESSION_COMPANY_KEY);
      }
      showToast(`Bem-vindo ao ContSuite, ${activeUser.name}!`);
      return;
    }

    throw new Error('Usuário ou e-mail não encontrado. Solicite convite ao Administrador (Rodrigo Bento).');
  };

  // Google Login / Logout handlers
  const handleGoogleSignIn = async () => {
    try {
      localStorage.setItem('contsuite_auth_mode', 'google');
      await loginWithGoogle();
      setIsAuthenticated(true);
      setActiveTab('home');
      localStorage.setItem('contsuite_logged_in', 'true');
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      showToast(err.message || 'Erro ao conectar com Google', 'error');
      throw err;
    }
  };

  const handleLogout = async () => {
    try {
      await logoutFirebase();
    } catch (e) {
      // ignore
    }
    masterMirrorSyncedRef.current = null;
    setIsAuthenticated(false);
    setActiveTab('home');
    setCurrentUser(NEUTRAL_GUEST_USER);
    setCurrentCompany(NEUTRAL_EMPTY_COMPANY);
    setAllCompanies([]);
    setAssets([]);
    setStatements([]);
    setDepreciationSummary(null);
    localStorage.removeItem('contsuite_logged_in');
    localStorage.removeItem('contsuite_auth_mode');
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_COMPANY_KEY);
    localStorage.removeItem('contsuite_cached_companies');
    localStorage.removeItem('contsuite_manual_ofx_job_v1');
    showToast('Sessão encerrada com sucesso.');
  };

  // Reload when company changes
  useEffect(() => {
    if (isAuthenticated && currentCompany.id) {
      fetchAssets();
      fetchDepreciation();
      fetchStatements();
    } else if (!currentCompany.id) {
      setAssets([]);
      setStatements([]);
      setDepreciationSummary(null);
    }
  }, [isAuthenticated, currentCompany.id, fetchAssets, fetchDepreciation, fetchStatements]);

  // Handlers for switching company (Strictly Master Admin only)
  const handleSwitchCompany = (companyId: string) => {
    if (!isMasterUser(currentUser)) {
      showToast('Apenas o Usuário Master pode alternar entre empresas.', 'error');
      return;
    }
    const target = allCompanies.find(c => c.id === companyId);
    if (target) {
      setCurrentCompany(target);
      showToast(`Contexto alterado para a empresa: ${target.fantasyName || target.name}`);
    }
  };

  // Handlers for switching user profile (Master Admin simulates any profile cleanly)
  const handleSwitchUser = (user: User) => {
    const isNextMaster = isMasterUser(user);
    setAssets([]);
    setStatements([]);
    setDepreciationSummary(null);
    setCurrentUser(user);

    const allowedCompanies = filterCompaniesForUser(allCompanies, user);
    if (!isNextMaster) {
      setAllCompanies(allowedCompanies);
    }

    const company =
      allowedCompanies.find(c => c.id === user.companyId) ||
      allowedCompanies[0] ||
      (isNextMaster ? currentCompany : NEUTRAL_EMPTY_COMPANY);

    setCurrentCompany(company);
    if (!isNextMaster && (activeTab === 'admin' || activeTab === 'database')) {
      setActiveTab('home');
    }

    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    if (company?.id) {
      localStorage.setItem(SESSION_COMPANY_KEY, JSON.stringify(company));
    } else {
      localStorage.removeItem(SESSION_COMPANY_KEY);
    }

    showToast(`Perfil alternado para: ${user.name} (${company?.fantasyName || company?.name || 'Sem Empresa'})`);
  };

  // Asset actions (Dual save to backend and Firebase Firestore)
  const handleSaveAsset = async (assetData: Partial<Asset>) => {
    if (assetToEdit) {
      const res = await fetch(`/api/assets/${assetToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetData),
      });
      if (!res.ok) throw new Error('Falha ao atualizar bem');
      const updated = await res.json();
      
      try {
        await saveAssetToFirestore(currentCompany.id, updated);
      } catch (e) {
        console.warn('Firestore sync asset warning:', e);
      }
      showToast('Bem patrimonial atualizado e salvo no Firebase!');
    } else {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetData),
      });
      if (!res.ok) throw new Error('Falha ao cadastrar bem');
      const created = await res.json();

      try {
        await saveAssetToFirestore(currentCompany.id, created);
      } catch (e) {
        console.warn('Firestore sync asset warning:', e);
      }
      showToast('Novo bem imobilizado cadastrado no Firebase Firestore!');
    }
    await fetchAssets();
    await fetchDepreciation();
    setAssetToEdit(null);
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir ativo');
      
      try {
        await deleteAssetFromFirestore(currentCompany.id, id);
      } catch (e) {
        console.warn('Firestore delete asset warning:', e);
      }
      showToast('Ativo excluído do inventário e do Firebase.');
      await fetchAssets();
      await fetchDepreciation();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir ativo', 'error');
    }
  };

  const handleUpdateAssetStatus = async (id: string, status: Asset['status'], notes?: string) => {
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error('Falha ao alterar status');
      showToast(`Status do bem alterado para: ${status}`);
      await fetchAssets();
      await fetchDepreciation();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  // Invite user action (Optimistic UI + API + Firestore + LocalStorage)
  const handleInviteUser = async (payload: {
    name: string;
    email: string;
    role: 'admin' | 'accountant' | 'client';
    companyName?: string;
    cnpj?: string;
    existingCompanyId?: string;
  }) => {
    const res = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao convidar usuário');
    }

    const newUserWithCompany = {
      ...data.user,
      company: data.company,
    };

    // 1. Optimistically update local users state immediately so it renders without delay
    setAllUsers(prev => {
      const filtered = prev.filter(u => u.email.toLowerCase() !== payload.email.toLowerCase());
      const updated = [newUserWithCompany, ...filtered];
      try {
        localStorage.setItem('contsuite_cached_users', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (data.company) {
      setAllCompanies(prev => {
        const filtered = prev.filter(c => c.id !== data.company.id);
        const updated = [...filtered, data.company];
        try {
          localStorage.setItem('contsuite_cached_companies', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }

    // 2. Dual persist to Firebase Firestore
    try {
      if (data.company) {
        await saveCompanyToFirestore(data.company);
      }
      await syncUserToFirestore(data.user);
    } catch (fErr) {
      console.warn('Could not sync invited user to Firestore:', fErr);
    }

    // 3. Re-fetch in background
    await fetchCompaniesAndUsers();
    showToast(`Convite gerado com sucesso! Usuário adicionado à lista "Aguardando Convite".`);
    return { user: data.user, emailPreview: data.emailPreview };
  };

  // Update user status (e.g. activate pending invitation)
  const handleUpdateUserStatus = async (userId: string, newStatus: 'active' | 'pending') => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      await safeJson<User>(res);
      
      setAllUsers(prev => {
        const next = prev.map(u => u.id === userId ? { ...u, status: newStatus } : u);
        try {
          localStorage.setItem('contsuite_cached_users', JSON.stringify(next));
        } catch {}
        return next;
      });

      const target = allUsers.find(u => u.id === userId);
      if (target) {
        try {
          await syncUserToFirestore({ ...target, status: newStatus });
        } catch (e) {
          console.warn('Error syncing status to Firestore:', e);
        }
      }

      showToast(`Status do usuário alterado para ${newStatus === 'active' ? 'Ativo' : 'Aguardando Convite'}`);
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  // Delete user or cancel invitation (Multi-layer cleanup: API + Firestore + LocalStorage)
  const handleDeleteUser = async (userId: string) => {
    try {
      try {
        await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      } catch (apiErr) {
        console.warn('API delete user warning:', apiErr);
      }

      try {
        await deleteUserFromFirestore(userId);
      } catch (fErr) {
        console.warn('Firestore delete user warning:', fErr);
      }

      setAllUsers(prev => {
        const next = prev.filter(u => u.id !== userId && u.email !== userId);
        try {
          localStorage.setItem('contsuite_cached_users', JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('Convite / Usuário excluído com sucesso!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover usuário', 'error');
    }
  };

  // Resend invitation with administrative copy to rodrigobento1979@gmail.com
  const handleResendInvite = async (userId: string) => {
    try {
      const targetUser = allUsers.find(u => u.id === userId || u.email === userId);
      const res = await fetch(`/api/users/${userId}/resend-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: targetUser,
          adminEmail: 'rodrigobento1979@gmail.com',
        }),
      });
      const data = await safeJson<any>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Falha ao reenviar convite');

      setAllUsers(prev => {
        const next = prev.map(u => (u.id === userId || u.email === userId) ? { ...u, ...data.user } : u);
        try {
          localStorage.setItem('contsuite_cached_users', JSON.stringify(next));
        } catch {}
        return next;
      });

      if (data.user) {
        try {
          await syncUserToFirestore(data.user);
        } catch {}
      }

      showToast(`Convite reenviado para ${data.user.email} com cópia para rodrigobento1979@gmail.com!`);
      return data;
    } catch (err: any) {
      showToast(err.message || 'Erro ao reenviar convite', 'error');
      throw err;
    }
  };

  // Save or update company (always anchored to Master Admin Rodrigo Bento and tracking creator user)
  const handleSaveCompany = async (companyData: Partial<Company>) => {
    if (companyToEdit) {
      const res = await fetch(`/api/companies/${companyToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...companyData,
          adminEmail: companyToEdit.adminEmail || 'rodrigobento1979@gmail.com',
          adminName: companyToEdit.adminName || 'Rodrigo Bento',
        }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar empresa');
      const updatedComp = await res.json();
      await fetchCompaniesAndUsers();
      if (currentCompany.id === updatedComp.id) {
        setCurrentCompany(updatedComp);
      }
      try {
        await saveCompanyToFirestore(updatedComp);
      } catch (e) {
        console.warn('Firestore update company warning:', e);
      }
      showToast(`Empresa "${updatedComp.fantasyName || updatedComp.name}" atualizada com sucesso!`);
    } else {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...companyData,
          adminEmail: 'rodrigobento1979@gmail.com',
          adminName: 'Rodrigo Bento',
          createdByUserId: currentUser.id,
          createdByEmail: currentUser.email,
          createdByName: currentUser.name,
        }),
      });
      if (!res.ok) throw new Error('Falha ao cadastrar empresa');
      const newComp = await res.json();
      await fetchCompaniesAndUsers();
      setCurrentCompany(newComp);

      try {
        await saveCompanyToFirestore(newComp);
      } catch (e) {
        console.warn('Firestore save company warning:', e);
      }
      showToast(`Empresa "${newComp.fantasyName || newComp.name}" cadastrada com sucesso!`);
    }
  };

  // If not logged in, render the clean Login Screen first
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onGoogleSignIn={handleGoogleSignIn}
        allCompanies={allCompanies}
      />
    );
  }

  return (
    <OfxAgentProvider
      currentUser={currentUser}
      currentCompany={currentCompany}
      allCompanies={allCompanies}
      onStatementsChanged={fetchStatements}
      onStatementCreated={handleStatementCreated}
      showToast={showToast}
    >
      <div className="min-h-screen bg-slate-100/70 text-slate-900 flex font-sans antialiased w-full">
        {/* Toast notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Desktop Left Sidebar: Sticky to viewport while main content scrolls with browser */}
        <div className="hidden md:flex shrink-0 sticky top-0 h-screen z-30">
          <Sidebar
            currentUser={currentUser}
            currentCompany={currentCompany}
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              setIsMobileSidebarOpen(false);
            }}
            onOpenCompanyModal={handleOpenNewCompanyModal}
            onOpenUserModal={() => setIsUserModalOpen(true)}
            onOpenHelpModal={() => setIsHelpModalOpen(true)}
            onOpenScanner={() => setIsScannerModalOpen(true)}
            onLogout={handleLogout}
          />
        </div>

      {/* Mobile Sidebar Overlay Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-10 w-64 flex shadow-2xl">
            <Sidebar
              currentUser={currentUser}
              currentCompany={currentCompany}
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setIsMobileSidebarOpen(false);
              }}
              onOpenCompanyModal={() => {
                handleOpenNewCompanyModal();
                setIsMobileSidebarOpen(false);
              }}
              onOpenUserModal={() => {
                setIsUserModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenHelpModal={() => {
                setIsHelpModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenScanner={() => {
                setIsScannerModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      {/* Right Column: Uses native browser window scroll at the exact right edge of the screen */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen w-full">
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200">
          <Header
            currentUser={currentUser}
            currentCompany={currentCompany}
            allCompanies={allCompanies}
            allUsers={allUsers}
            activeTab={activeTab}
            onSwitchCompany={handleSwitchCompany}
            onOpenUserModal={() => setIsUserModalOpen(true)}
            onLogout={handleLogout}
            onToggleMobileMenu={() => setIsMobileSidebarOpen(true)}
          />
        </div>

        {/* Main Content Area - Natural height, zero internal scrollbar, zero horizontal overflow */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-5 lg:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2.5">
              <Loader2 className="w-7 h-7 animate-spin text-[#00897b]" />
              <p className="text-xs font-semibold">Carregando ambiente ContSuite...</p>
            </div>
          ) : (
            <>
              {/* 1. Unpolluted Home Screen with Interactive AI Guide Agent */}
              {activeTab === 'home' && (
                <AiGuideHomeView
                  currentUser={currentUser}
                  currentCompany={currentCompany}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenCompanyModal={handleOpenNewCompanyModal}
                />
              )}

              {/* 2. Cadastros: Carteira de Empresas */}
              {activeTab === 'companies' && (
                <CompaniesView
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                  allUsers={allUsers}
                  currentUser={currentUser}
                  onSelectCompany={(comp) => handleSwitchCompany(comp.id)}
                  onQuickNavigate={(comp, tab) => {
                    handleSwitchCompany(comp.id);
                    setActiveTab(tab);
                  }}
                  onRefreshCompanies={fetchCompaniesAndUsers}
                  onOpenNewCompanyModal={() => {
                    setCompanyToEdit(null);
                    setCompanyPrefill(null);
                    setIsCompanyModalOpen(true);
                  }}
                  onEditCompany={(comp) => {
                    setCompanyToEdit(comp);
                    setCompanyPrefill(null);
                    setIsCompanyModalOpen(true);
                  }}
                />
              )}

              {/* 3. Ativo Imobilizado Unificado (Inventário, Depreciação Mensal/Trimestral/Anual, Projeção, Baixas e Integração NG/Domínio) */}
              {(activeTab === 'assets' || activeTab === 'depreciation') && (
                <AssetsView
                  assets={assets}
                  currentCompany={currentCompany}
                  initialSubTab={activeTab === 'depreciation' ? 'depreciacao' : 'inventario'}
                  onOpenNewAsset={() => {
                    setAssetToEdit(null);
                    setIsAssetModalOpen(true);
                  }}
                  onOpenSmartImport={() => setIsAssetSmartImportOpen(true)}
                  onEditAsset={(asset) => {
                    setAssetToEdit(asset);
                    setIsAssetModalOpen(true);
                  }}
                  onDeleteAsset={handleDeleteAsset}
                  onUpdateAssetStatus={handleUpdateAssetStatus}
                  onRefreshAssets={fetchAssets}
                />
              )}

              {/* 4. Streamlined Conversor OFX com IA */}
              {activeTab === 'ofx' && (
                <OfxConverterView
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                  onOpenCompanyModalWithData={handleOpenCompanyModalWithPrefill}
                  onSelectCompany={handleSwitchCompany}
                  historyStatements={statements}
                  onRefreshHistory={fetchStatements}
                  onStatementDeleted={handleStatementDeleted}
                  initialFile={pendingOfxFile}
                  onConsumeInitialFile={() => setPendingOfxFile(null)}
                />
              )}

              {/* 4b. Ferramentas > Arquivos (Documentos Contábeis em Kanban & Lista) */}
              {activeTab === 'documents' && (
                <DocumentsView
                  currentUser={currentUser}
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                  allUsers={allUsers}
                  pendingPreviewDoc={pendingScannedDoc}
                  onConsumePendingPreviewDoc={() => setPendingScannedDoc(null)}
                  onSelectCompany={handleSwitchCompany}
                  onOpenInOfxConverter={(file) => {
                    setPendingOfxFile(file);
                    setActiveTab('ofx');
                  }}
                  showToast={showToast}
                />
              )}

              {/* 5. Plano de Contas & Parâmetros */}
              {activeTab === 'accounts' && (
                <ChartOfAccountsView
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                />
              )}

              {/* 6. Controle Financeiro de Honorários Contábeis */}
              {activeTab === 'fees' && (
                <HonorariosView
                  currentUser={currentUser}
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                  showToast={showToast}
                />
              )}

              {/* 7. Gestão de Banco de Dados, Backups & Limpeza (Master Admin Only) */}
              {activeTab === 'database' && isMasterUser(currentUser) && (
                <DatabaseView
                  currentUser={currentUser}
                  currentCompany={currentCompany}
                  onDataChanged={async () => {
                    await fetchCompaniesAndUsers();
                    await fetchAssets();
                    await fetchDepreciation();
                    await fetchStatements();
                  }}
                  showToast={showToast}
                />
              )}

              {/* 8. Gestão de Usuários & Convites (Master Admin Only) */}
              {activeTab === 'admin' && isMasterUser(currentUser) && (
                <AdminUsersView
                  currentUser={currentUser}
                  allUsers={allUsers}
                  allCompanies={allCompanies}
                  onInviteUser={handleInviteUser}
                  onSwitchUserContext={(userId) => {
                    const targetUser = allUsers.find(u => u.id === userId);
                    if (targetUser) handleSwitchUser(targetUser);
                  }}
                  onNavigateCompany={(comp, tab) => {
                    handleSwitchCompany(comp.id);
                    setActiveTab(tab || 'companies');
                  }}
                  onRefreshUsers={fetchCompaniesAndUsers}
                  onUpdateUserStatus={handleUpdateUserStatus}
                  onDeleteUser={handleDeleteUser}
                  onResendInvite={handleResendInvite}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Asset Modal */}
      <AssetModal
        isOpen={isAssetModalOpen}
        onClose={() => {
          setIsAssetModalOpen(false);
          setAssetToEdit(null);
        }}
        onSave={handleSaveAsset}
        assetToEdit={assetToEdit}
        company={currentCompany}
      />

      {/* Asset Smart Import Modal */}
      <AssetSmartImportModal
        isOpen={isAssetSmartImportOpen}
        onClose={() => setIsAssetSmartImportOpen(false)}
        currentCompany={currentCompany}
        onSaveAsset={handleSaveAsset}
        showToast={showToast}
      />

      {/* User Profile / Testing Modal */}
      <UserProfileModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        currentUser={currentUser}
        currentCompany={currentCompany}
        allUsers={allUsers}
        onSelectUser={handleSwitchUser}
      />

      {/* New Company Modal */}
      <CompanyModal
        isOpen={isCompanyModalOpen}
        onClose={() => {
          setIsCompanyModalOpen(false);
          setCompanyPrefill(null);
          setCompanyToEdit(null);
        }}
        onSave={async (data) => {
          await handleSaveCompany(data);
          setCompanyPrefill(null);
          setCompanyToEdit(null);
        }}
        adminEmail={currentUser.email}
        prefillData={companyPrefill}
        companyToEdit={companyToEdit}
      />

      {/* Help Center & Changelog Modal (v1.0) */}
      <HelpCenterModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        isAdmin={isMasterUser(currentUser)}
      />

      {/* Document Scanner / Camera Modal */}
      <DocumentScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        currentUser={currentUser}
        currentCompany={currentCompany}
        showToast={showToast}
        onDocumentSaved={(doc) => {
          setPendingScannedDoc(doc);
          if (activeTab !== 'documents') setActiveTab('documents');
        }}
      />
      </div>
    </OfxAgentProvider>
  );
}

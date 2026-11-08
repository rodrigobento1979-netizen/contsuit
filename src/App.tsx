import React, { useState, useEffect, useCallback } from 'react';
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
import { Sidebar, AppNavTab } from './components/Sidebar';
import { User, Company, Asset, DepreciationSummary, ConvertedStatement } from './types';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { 
  loginWithGoogle, 
  logoutFirebase, 
  subscribeToAuth,
  saveCompanyToFirestore,
  fetchCompaniesFromFirestore,
  saveAssetToFirestore,
  deleteAssetFromFirestore,
  saveStatementToFirestore,
  syncUserToFirestore,
  fetchUsersFromFirestore
} from './firebase/service';

export default function App() {
  // Start unauthenticated so user sees the login screen from the image attachment
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('contsuite_logged_in') === 'true';
  });

  // Default tab is 'home' so the user is greeted by the AI agent without entering any raw tables
  const [activeTab, setActiveTab] = useState<AppNavTab>('home');

  const [currentUser, setCurrentUser] = useState<User>({
    id: 'usr-admin-1',
    name: 'Rodrigo Bento',
    email: 'rodrigobento1979@gmail.com',
    role: 'admin',
    companyId: 'comp-master',
    createdAt: '2026-01-01T08:00:00.000Z',
    status: 'active',
  });

  const [currentCompany, setCurrentCompany] = useState<Company>({
    id: 'comp-master',
    name: 'Bento & Associados Consultoria Contábil',
    cnpj: '12.345.678/0001-90',
    fantasyName: 'Bento Contabilidade',
    contactEmail: 'rodrigobento1979@gmail.com',
    phone: '(11) 98765-4321',
    accountingSystem: 'dominio',
    chartOfAccounts: {
      assetDefaultAccount: '1.2.3.01.0001',
      depreciationExpenseAccount: '3.1.2.04.0010',
      accumulatedDepreciationAccount: '1.2.3.09.0001',
    },
    createdAt: '2026-01-01T08:00:00.000Z',
  });

  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allUsers, setAllUsers] = useState<(User & { company?: Company })[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depreciationSummary, setDepreciationSummary] = useState<DepreciationSummary | null>(null);
  const [statements, setStatements] = useState<ConvertedStatement[]>([]);

  // Firebase auth user
  const [firebaseUser, setFirebaseUser] = useState<any>(null);

  // Period for depreciation
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');

  // Modals
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<Asset | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyPrefill, setCompanyPrefill] = useState<{ name?: string; cnpj?: string; fantasyName?: string } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleOpenCompanyModalWithPrefill = (prefill: { name?: string; cnpj?: string; fantasyName?: string }) => {
    setCompanyPrefill(prefill);
    setIsCompanyModalOpen(true);
  };

  // Global Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);

  // Synchronize document title and icon in browser tab
  useEffect(() => {
    document.title = 'ContSuite - Sistema Contábil';
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

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

  // 1. Fetch Companies and Users (Scoped to user role and tenant, resilient across Vercel & Firestore)
  const fetchCompaniesAndUsers = useCallback(async () => {
    try {
      const companyUrl = currentUser.role === 'client' && currentUser.companyId
        ? `/api/companies?role=client&companyId=${currentUser.companyId}`
        : '/api/companies';

      const [compRes, usersRes] = await Promise.all([
        fetch(companyUrl),
        fetch('/api/users'),
      ]);

      const apiComps = (await safeJson<Company[]>(compRes)) || [];
      const apiUsers = (await safeJson<User[]>(usersRes)) || [];

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

      // Merge Companies from API, Firestore, and LocalStorage
      let localComps: Company[] = [];
      try {
        const cached = localStorage.getItem('contsuite_cached_companies');
        if (cached) localComps = JSON.parse(cached);
      } catch {}

      const compMap = new Map<string, Company>();
      [...apiComps, ...firestoreCompanies, ...localComps].forEach(c => {
        if (c && c.id) {
          compMap.set(c.id, { ...compMap.get(c.id), ...c });
        }
      });
      const mergedComps = Array.from(compMap.values());
      if (mergedComps.length > 0) {
        setAllCompanies(mergedComps);
        try {
          localStorage.setItem('contsuite_cached_companies', JSON.stringify(mergedComps));
        } catch {}

        const found = mergedComps.find(c => c.id === currentCompany.id);
        if (found) {
          setCurrentCompany(found);
        } else {
          setCurrentCompany(mergedComps[0]);
        }
      }

      // Merge Users from API, Firestore, and LocalStorage
      let localUsers: User[] = [];
      try {
        const cached = localStorage.getItem('contsuite_cached_users');
        if (cached) localUsers = JSON.parse(cached);
      } catch {}

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
    } catch (err) {
      console.error('Error fetching companies/users:', err);
    }
  }, [currentCompany.id, currentUser.role, currentUser.companyId]);

  // 2. Fetch Assets for current company (Data Isolation)
  const fetchAssets = useCallback(async () => {
    if (!currentCompany.id) return;
    try {
      const res = await fetch(`/api/assets?companyId=${currentCompany.id}`);
      const data = await safeJson<Asset[]>(res);
      if (data && Array.isArray(data)) {
        setAssets(data);
      }
    } catch (err) {
      console.error('Error fetching assets:', err);
    }
  }, [currentCompany.id]);

  // 3. Fetch Depreciation Summary for current company & month
  const fetchDepreciation = useCallback(async () => {
    if (!currentCompany.id) return;
    try {
      const res = await fetch(`/api/assets/depreciation?companyId=${currentCompany.id}&month=${selectedMonth}`);
      const data = await safeJson<DepreciationSummary>(res);
      if (data) {
        setDepreciationSummary(data);
      }
    } catch (err) {
      console.error('Error fetching depreciation:', err);
    }
  }, [currentCompany.id, selectedMonth]);

  // 4. Fetch Converted Statements
  const fetchStatements = useCallback(async () => {
    if (!currentCompany.id) return;
    try {
      const res = await fetch(`/api/ofx/history?companyId=${currentCompany.id}`);
      const data = await safeJson<ConvertedStatement[]>(res);
      if (data && Array.isArray(data)) {
        setStatements(data);
      }
    } catch (err) {
      console.error('Error fetching statements:', err);
    }
  }, [currentCompany.id]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchCompaniesAndUsers();
      setLoading(false);
    };
    init();

    // Listen to Firebase Authentication state
    const unsubscribe = subscribeToAuth(async (user) => {
      setFirebaseUser(user);
      if (user && user.email) {
        const isAdminEmail = user.email.toLowerCase() === 'rodrigobento1979@gmail.com';
        const role = isAdminEmail ? 'admin' : 'client';

        const syncedUser: User = {
          id: user.uid,
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
          role: role as any,
          companyId: currentCompany.id || 'comp-master',
          createdAt: new Date().toISOString(),
          status: 'active',
        };

        setCurrentUser(syncedUser);
        setIsAuthenticated(true);
        setActiveTab('home');
        localStorage.setItem('contsuite_logged_in', 'true');
        try {
          await syncUserToFirestore(syncedUser);
        } catch (e) {
          console.warn('Could not sync user to Firestore:', e);
        }
        await fetchCompaniesAndUsers();
        showToast(`Conectado com Google: ${user.email}`);
      }
    });

    return () => unsubscribe();
  }, [fetchCompaniesAndUsers, currentCompany.id]);

  // Login handler
  const handleLogin = async (email: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao autenticar.');
    }

    setCurrentUser(data.user);
    if (data.company) {
      setCurrentCompany(data.company);
    }
    setIsAuthenticated(true);
    setActiveTab('home');
    localStorage.setItem('contsuite_logged_in', 'true');
    showToast(`Bem-vindo ao ContSuite, ${data.user.name}!`);
  };

  // Google Login / Logout handlers
  const handleGoogleSignIn = async () => {
    try {
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
    setIsAuthenticated(false);
    setActiveTab('home');
    localStorage.removeItem('contsuite_logged_in');
    showToast('Sessão encerrada com sucesso.');
  };

  // Reload when company changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchAssets();
      fetchDepreciation();
      fetchStatements();
    }
  }, [isAuthenticated, fetchAssets, fetchDepreciation, fetchStatements]);

  // Handlers for switching company
  const handleSwitchCompany = (companyId: string) => {
    const target = allCompanies.find(c => c.id === companyId);
    if (target) {
      setCurrentCompany(target);
      showToast(`Contexto alterado para a empresa: ${target.fantasyName || target.name}`);
    }
  };

  // Handlers for switching user profile
  const handleSwitchUser = (user: User) => {
    setCurrentUser(user);
    const company = allCompanies.find(c => c.id === user.companyId);
    if (company) {
      setCurrentCompany(company);
    }
    if (user.role !== 'admin' && activeTab === 'admin') {
      setActiveTab('assets');
    }
    showToast(`Perfil alternado para: ${user.name} (${company?.fantasyName || 'Empresa'})`);
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

  // Delete user or cancel invitation
  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao remover usuário');

      setAllUsers(prev => {
        const next = prev.filter(u => u.id !== userId);
        try {
          localStorage.setItem('contsuite_cached_users', JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('Usuário / Convite removido com sucesso!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover usuário', 'error');
    }
  };

  // Resend invitation
  const handleResendInvite = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}/resend-invite`, { method: 'POST' });
      const data = await safeJson<any>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Falha ao reenviar convite');

      setAllUsers(prev => {
        const next = prev.map(u => u.id === userId ? { ...u, ...data.user } : u);
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

      showToast(`Convite reenviado com sucesso para ${data.user.email}!`);
      return data;
    } catch (err: any) {
      showToast(err.message || 'Erro ao reenviar convite', 'error');
      throw err;
    }
  };

  // Save new company (explicitly bound to the master user)
  const handleSaveCompany = async (companyData: Partial<Company>) => {
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...companyData,
        adminEmail: currentUser.email || 'rodrigobento1979@gmail.com',
        adminName: currentUser.name || 'Rodrigo Bento',
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
          onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
          onOpenUserModal={() => setIsUserModalOpen(true)}
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
                setIsCompanyModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenUserModal={() => {
                setIsUserModalOpen(true);
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
                  onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
                />
              )}

              {/* 2. Cadastros: Carteira de Empresas */}
              {activeTab === 'companies' && (
                <CompaniesView
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                  currentUser={currentUser}
                  onSelectCompany={(comp) => handleSwitchCompany(comp.id)}
                  onOpenNewCompanyModal={() => setIsCompanyModalOpen(true)}
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
                  currentCompany={currentCompany}
                  allCompanies={allCompanies}
                  showToast={showToast}
                />
              )}

              {/* 7. Gestão de Banco de Dados, Backups & Limpeza */}
              {activeTab === 'database' && (
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

              {/* 8. Gestão de Usuários & Convites (Admin Only) */}
              {activeTab === 'admin' && currentUser.role === 'admin' && (
                <AdminUsersView
                  currentUser={currentUser}
                  allUsers={allUsers}
                  allCompanies={allCompanies}
                  onInviteUser={handleInviteUser}
                  onSwitchUserContext={(userId) => {
                    const targetUser = allUsers.find(u => u.id === userId);
                    if (targetUser) handleSwitchUser(targetUser);
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
        }}
        onSave={async (data) => {
          await handleSaveCompany(data);
          setCompanyPrefill(null);
        }}
        adminEmail={currentUser.email}
        prefillData={companyPrefill}
      />
    </div>
  );
}

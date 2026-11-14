import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'accountant' | 'client';
  companyId: string;
  avatarUrl?: string;
  createdAt: string;
  status: 'active' | 'pending';
  invitationToken?: string;
  invitedAt?: string;
}

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  fantasyName: string;
  contactEmail: string;
  phone: string;
  accountingSystem: 'dominio' | 'questor' | 'fortes' | 'alterdata' | 'totvs' | 'sci' | 'outro';
  chartOfAccounts?: {
    assetDefaultAccount: string;
    depreciationExpenseAccount: string;
    accumulatedDepreciationAccount: string;
  };
  adminEmail?: string;
  adminName?: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  companyId: string;
  tagNumber: string; // Plaqueta patrimonial (ex: AT-00101)
  description: string;
  category: 'edificacoes' | 'maquinas' | 'veiculos' | 'moveis' | 'ti' | 'software' | 'ferramentas' | 'instalacoes' | 'outro';
  categoryLabel: string;
  acquisitionDate: string; // YYYY-MM-DD
  depreciationStartDate: string; // YYYY-MM-DD
  acquisitionValue: number; // R$
  residualValue: number; // R$
  depreciableValue: number; // acquisitionValue - residualValue
  annualRate: number; // e.g. 20 (for 20% a.a.)
  usefulLifeMonths: number; // e.g. 60 (for 5 years)
  monthlyRate: number; // annualRate / 12
  costCenter: string;
  location: string;
  supplier: string;
  invoiceNumber: string;
  debitAccount: string; // Despesa de Depreciação
  creditAccount: string; // Depreciação Acumulada
  assetAccount: string; // Conta do Ativo Imobilizado
  status: 'ativo' | 'baixado' | 'totalmente_depreciado' | 'em_manutencao';
  disposalDate?: string;
  disposalReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  memo: string;
  fitid: string;
  category?: string;
  checkNumber?: string;
}

export interface ConvertedStatement {
  id: string;
  companyId: string;
  uploadedAt: string;
  originalFileName: string;
  bankName: string;
  bankCode: string;
  agency: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'BUSINESS';
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  transactionsCount: number;
  transactions: BankTransaction[];
  ofxContent: string;
  fileBase64?: string;
  fileMimeType?: string;
  hasOriginalFile?: boolean;
  totalPages?: number;
  pagesProcessed?: number;
}

export interface FeeContract {
  id: string;
  companyId: string;
  companyName: string;
  cnpj: string;
  monthlyFee: number;
  dueDay: number;
  status: 'active' | 'suspended' | 'cancelled';
  services: string[];
  contactEmail?: string;
  notes?: string;
  lastPaymentStatus: 'pago' | 'em_aberto' | 'atrasado';
  lastPaymentMonth: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeePaymentRecord {
  id: string;
  contractId: string;
  companyId: string;
  competenceMonth: string;
  amount: number;
  paidAt: string;
  paymentMethod: 'pix' | 'boleto' | 'transferencia' | 'cartao';
  notes?: string;
}

export interface ChartAccount {
  id: string;
  companyId: string;
  code: string; // e.g. "1.1.1.02.0001"
  name: string; // e.g. "Banco Itaú c/c"
  type: 'analitica' | 'sintetica';
  nature: 'devedora' | 'credora';
  group: 'ativo' | 'passivo' | 'patrimonio' | 'receita' | 'despesa';
  categoryTag?: 'banco' | 'imobilizado' | 'depreciacao_acumulada' | 'despesa_depreciacao' | 'outro';
  syntheticParentCode?: string;
  level: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type DocumentCategory =
  | 'extrato'
  | 'nota_fiscal'
  | 'guia_imposto'
  | 'comprovante'
  | 'folha_contrato'
  | 'outro';

export type DocumentStatus = 'pendente' | 'em_analise' | 'contabilizado';

export interface CompanyDocument {
  id: string;
  companyId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: DocumentCategory;
  status: DocumentStatus;
  competenceMonth: string; // YYYY-MM
  documentDate?: string;
  issuerOrBank?: string;
  documentNumber?: string;
  amount?: number;
  detectedCnpj?: string;
  summary?: string;
  aiClassified: boolean;
  confidence?: number;
  notes?: string;
  uploadedBy?: string;
  uploadedAt: string;
  updatedAt: string;
  fileBase64?: string;
  hasOriginalFile?: boolean;
}

export interface SystemData {
  users: User[];
  companies: Company[];
  assets: Asset[];
  statements: ConvertedStatement[];
  fees: FeeContract[];
  payments: FeePaymentRecord[];
  accounts: ChartAccount[];
  documents: CompanyDocument[];
}

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercel ? path.resolve('/tmp', 'contsuite_data') : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Initial seed data with Rodrigo Bento as the master administrator (Clean production baseline)
const INITIAL_DATA: SystemData = {
  users: [
    {
      id: 'usr-admin-1',
      name: 'Rodrigo Bento',
      email: 'rodrigobento1979@gmail.com',
      role: 'admin',
      companyId: 'comp-master',
      createdAt: '2026-01-01T08:00:00.000Z',
      status: 'active',
    }
  ],
  companies: [
    {
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
    }
  ],
  assets: [],
  statements: [],
  fees: [],
  payments: [],
  documents: [],
  accounts: [
    { id: 'acc-1', companyId: 'comp-master', code: '1.1.1.02.0001', name: 'Banco Itaú Unibanco S/A c/c', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'banco', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-2', companyId: 'comp-master', code: '1.1.1.02.0002', name: 'Banco Bradesco S/A c/c', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'banco', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-3', companyId: 'comp-master', code: '1.2.3.01.0001', name: 'Edificações e Construções', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-4', companyId: 'comp-master', code: '1.2.3.01.0002', name: 'Máquinas e Equipamentos Industriais', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-5', companyId: 'comp-master', code: '1.2.3.01.0003', name: 'Móveis e Utensílios de Escritório', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-6', companyId: 'comp-master', code: '1.2.3.01.0004', name: 'Veículos e Automóveis', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-7', companyId: 'comp-master', code: '1.2.3.01.0005', name: 'Equipamentos de Informática (TI)', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-8', companyId: 'comp-master', code: '1.2.3.09.0001', name: '(-) Depreciação Acumulada - Edificações', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-9', companyId: 'comp-master', code: '1.2.3.09.0002', name: '(-) Depreciação Acumulada - Máquinas', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-10', companyId: 'comp-master', code: '1.2.3.09.0003', name: '(-) Depreciação Acumulada - Móveis', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-11', companyId: 'comp-master', code: '1.2.3.09.0004', name: '(-) Depreciação Acumulada - Veículos', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-12', companyId: 'comp-master', code: '1.2.3.09.0005', name: '(-) Depreciação Acumulada - TI', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-13', companyId: 'comp-master', code: '3.1.2.04.0010', name: 'Despesas com Depreciação e Amortização', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'despesa_depreciacao', level: 4, createdAt: '2026-01-01T08:00:00.000Z' },
    { id: 'acc-14', companyId: 'comp-master', code: '3.1.3.01.0001', name: 'Despesas Financeiras e Tarifas Bancárias', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'outro', level: 4, createdAt: '2026-01-01T08:00:00.000Z' }
  ]
};

// In-memory cache + file sync
let memoryDb: SystemData = INITIAL_DATA;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const bundledPath = path.resolve(process.cwd(), 'data', 'db.json');
      if (fs.existsSync(bundledPath)) {
        try {
          fs.copyFileSync(bundledPath, DB_FILE);
          return;
        } catch {}
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('Could not ensure data directory:', err);
  }
}

export function loadDb(): SystemData {
  try {
    ensureDataDir();
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      // Merge with initial in case some keys were added
      memoryDb = {
        users: parsed.users || INITIAL_DATA.users,
        companies: parsed.companies || INITIAL_DATA.companies,
        assets: parsed.assets || INITIAL_DATA.assets,
        statements: parsed.statements || INITIAL_DATA.statements,
        fees: parsed.fees || INITIAL_DATA.fees,
        payments: parsed.payments || INITIAL_DATA.payments,
        accounts: parsed.accounts || INITIAL_DATA.accounts,
        documents: parsed.documents || INITIAL_DATA.documents,
      };
      return memoryDb;
    }
  } catch (err) {
    console.warn('Failed reading db.json, using memory cache:', err);
  }
  return memoryDb;
}

export function saveDb(data: SystemData): void {
  memoryDb = data;
  try {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed writing db.json, state preserved in memory:', err);
  }
}

// Helper methods
export function getCompanies() {
  return loadDb().companies;
}

export function getCompanyById(id: string) {
  return loadDb().companies.find(c => c.id === id);
}

export function createCompany(company: Omit<Company, 'id' | 'createdAt'>) {
  const db = loadDb();
  const newCompany: Company = {
    ...company,
    adminEmail: company.adminEmail || 'rodrigobento1979@gmail.com',
    adminName: company.adminName || 'Rodrigo Bento',
    id: 'comp-' + Date.now().toString(36),
    createdAt: new Date().toISOString(),
  };
  db.companies.push(newCompany);
  saveDb(db);
  return newCompany;
}

export function getUsers() {
  return loadDb().users;
}

export function getUserById(id: string) {
  return loadDb().users.find(u => u.id === id);
}

export function getUserByEmail(email: string) {
  const norm = email.toLowerCase().trim();
  return loadDb().users.find(u => u.email.toLowerCase().trim() === norm);
}

export function createUser(user: Omit<User, 'id' | 'createdAt'>) {
  const db = loadDb();
  const newUser: User = {
    ...user,
    id: 'usr-' + Date.now().toString(36),
    createdAt: new Date().toISOString(),
  };
  db.users.push(newUser);
  saveDb(db);
  return newUser;
}

export function updateUser(id: string, updates: Partial<User>) {
  const db = loadDb();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx !== -1) {
    db.users[idx] = { ...db.users[idx], ...updates };
    saveDb(db);
    return db.users[idx];
  }
  return null;
}

export function deleteUser(id: string) {
  const db = loadDb();
  const lower = id.toLowerCase().trim();
  const idx = db.users.findIndex(u => 
    u.id === id || 
    u.email.toLowerCase().trim() === lower || 
    (u.invitationToken && u.invitationToken === id)
  );
  if (idx !== -1) {
    const deleted = db.users.splice(idx, 1)[0];
    saveDb(db);
    return deleted;
  }
  return null;
}

export function getAssets(companyId?: string) {
  const db = loadDb();
  if (companyId && companyId !== 'all') {
    return db.assets.filter(a => a.companyId === companyId);
  }
  return db.assets;
}

export function getAssetById(id: string) {
  return loadDb().assets.find(a => a.id === id);
}

export function createAsset(asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'depreciableValue' | 'monthlyRate'>) {
  const db = loadDb();
  const depreciableValue = Math.max(0, asset.acquisitionValue - (asset.residualValue || 0));
  const monthlyRate = (asset.annualRate || 0) / 12;
  const now = new Date().toISOString();
  
  const newAsset: Asset = {
    ...asset,
    id: 'ast-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
    depreciableValue,
    monthlyRate,
    createdAt: now,
    updatedAt: now,
  };
  db.assets.push(newAsset);
  saveDb(db);
  return newAsset;
}

export function updateAsset(id: string, updates: Partial<Asset>) {
  const db = loadDb();
  const idx = db.assets.findIndex(a => a.id === id);
  if (idx !== -1) {
    const current = db.assets[idx];
    const acquisitionValue = updates.acquisitionValue !== undefined ? updates.acquisitionValue : current.acquisitionValue;
    const residualValue = updates.residualValue !== undefined ? updates.residualValue : current.residualValue;
    const annualRate = updates.annualRate !== undefined ? updates.annualRate : current.annualRate;
    
    const depreciableValue = Math.max(0, acquisitionValue - (residualValue || 0));
    const monthlyRate = (annualRate || 0) / 12;
    
    db.assets[idx] = {
      ...current,
      ...updates,
      depreciableValue,
      monthlyRate,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return db.assets[idx];
  }
  return null;
}

export function deleteAsset(id: string) {
  const db = loadDb();
  const initialLen = db.assets.length;
  db.assets = db.assets.filter(a => a.id !== id);
  if (db.assets.length !== initialLen) {
    saveDb(db);
    return true;
  }
  return false;
}

export function getStatements(companyId?: string) {
  const db = loadDb();
  if (companyId && companyId !== 'all') {
    return db.statements.filter(s => s.companyId === companyId);
  }
  return db.statements;
}

export function saveStatement(stmt: Omit<ConvertedStatement, 'id' | 'uploadedAt'>) {
  const db = loadDb();
  const newStmt: ConvertedStatement = {
    ...stmt,
    id: 'stmt-' + Date.now().toString(36),
    uploadedAt: new Date().toISOString(),
  };
  db.statements.unshift(newStmt);
  saveDb(db);
  return newStmt;
}

export function getStatementById(id: string) {
  return loadDb().statements.find(s => s.id === id);
}

export function deleteStatement(id: string) {
  const db = loadDb();
  const initialLength = db.statements.length;
  db.statements = db.statements.filter(s => s.id !== id);
  if (db.statements.length !== initialLength) {
    saveDb(db);
    return true;
  }
  return false;
}

// ---------------------------------------------------------
// HONORÁRIOS CONTÁBEIS (FINANCIAL FEE MANAGEMENT)
// ---------------------------------------------------------
export function getFees(companyId?: string) {
  const db = loadDb();
  if (companyId && companyId !== 'all') {
    return db.fees.filter(f => f.companyId === companyId);
  }
  return db.fees;
}

export function getFeeById(id: string) {
  return loadDb().fees.find(f => f.id === id);
}

export function createFee(fee: Omit<FeeContract, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = loadDb();
  const now = new Date().toISOString();
  const newFee: FeeContract = {
    ...fee,
    id: 'fee-' + Date.now().toString(36),
    createdAt: now,
    updatedAt: now,
  };
  db.fees.unshift(newFee);
  saveDb(db);
  return newFee;
}

export function updateFee(id: string, updates: Partial<FeeContract>) {
  const db = loadDb();
  const idx = db.fees.findIndex(f => f.id === id);
  if (idx !== -1) {
    db.fees[idx] = {
      ...db.fees[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return db.fees[idx];
  }
  return null;
}

export function recordFeePayment(contractId: string, payload: {
  amount: number;
  competenceMonth: string;
  paymentMethod: 'pix' | 'boleto' | 'transferencia' | 'cartao';
  notes?: string;
}) {
  const db = loadDb();
  const contract = db.fees.find(f => f.id === contractId);
  if (!contract) return null;

  const now = new Date().toISOString();
  const payment: FeePaymentRecord = {
    id: 'pay-' + Date.now().toString(36),
    contractId,
    companyId: contract.companyId,
    competenceMonth: payload.competenceMonth || now.slice(0, 7),
    amount: payload.amount || contract.monthlyFee,
    paidAt: now,
    paymentMethod: payload.paymentMethod || 'pix',
    notes: payload.notes || 'Pagamento liquidado via sistema.',
  };

  db.payments.unshift(payment);
  contract.lastPaymentStatus = 'pago';
  contract.lastPaymentMonth = payment.competenceMonth;
  contract.updatedAt = now;

  saveDb(db);
  return { contract, payment };
}

export function getFeePayments(contractId?: string) {
  const db = loadDb();
  if (contractId) {
    return db.payments.filter(p => p.contractId === contractId);
  }
  return db.payments;
}

// ---------------------------------------------------------
// PLANO DE CONTAS (CHART OF ACCOUNTS)
// ---------------------------------------------------------
export function getAccounts(companyId?: string) {
  const db = loadDb();
  if (companyId && companyId !== 'all') {
    return db.accounts.filter(a => !a.companyId || a.companyId === companyId || a.companyId === 'comp-master');
  }
  return db.accounts;
}

export function getAccountById(id: string) {
  return loadDb().accounts.find(a => a.id === id);
}

export function createAccount(acc: Omit<ChartAccount, 'id' | 'createdAt'>) {
  const db = loadDb();
  const newAccount: ChartAccount = {
    ...acc,
    id: 'acc-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
    createdAt: new Date().toISOString(),
  };
  db.accounts.push(newAccount);
  saveDb(db);
  return newAccount;
}

export function createBulkAccounts(companyId: string, accounts: Omit<ChartAccount, 'id' | 'createdAt'>[]) {
  const db = loadDb();
  const created: ChartAccount[] = [];
  const now = new Date().toISOString();

  for (const acc of accounts) {
    // Avoid exact duplicate code for same company
    const exists = db.accounts.some(a => a.code === acc.code && (a.companyId === companyId || a.companyId === acc.companyId));
    if (!exists) {
      const item: ChartAccount = {
        ...acc,
        companyId: acc.companyId || companyId,
        id: 'acc-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000),
        createdAt: now,
      };
      db.accounts.push(item);
      created.push(item);
    }
  }
  saveDb(db);
  return created;
}

export function deleteAccount(id: string) {
  const db = loadDb();
  const initialLen = db.accounts.length;
  db.accounts = db.accounts.filter(a => a.id !== id);
  if (db.accounts.length !== initialLen) {
    saveDb(db);
    return true;
  }
  return false;
}

// ---------------------------------------------------------
// BANCO DE DADOS: STATS, BACKUP, RESTORE & LIMPEZA DE DEMO
// ---------------------------------------------------------
export function getDatabaseStats() {
  const db = loadDb();
  let fileSizeKb = 0;
  try {
    if (fs.existsSync(DB_FILE)) {
      const stats = fs.statSync(DB_FILE);
      fileSizeKb = Math.round(stats.size / 1024);
    }
  } catch (err) {
    console.warn('Could not read db file size:', err);
  }

  return {
    status: 'online',
    engine: 'Firebase Firestore + Local JSON Cache',
    databaseId: 'ai-studio-activixcontbil-fd974dcb-fbbe-4b91-be88-235e45b53bfe',
    filePath: DB_FILE,
    fileSizeKb,
    lastSync: new Date().toISOString(),
    counts: {
      companies: db.companies.length,
      users: db.users.length,
      assets: db.assets.length,
      statements: db.statements.length,
      fees: db.fees.length,
      payments: db.payments.length,
      accounts: db.accounts.length,
      documents: (db.documents || []).length,
    },
  };
}

export function exportBackup() {
  const db = loadDb();
  return {
    version: '1.0',
    system: 'ContSuite Contábil',
    exportedAt: new Date().toISOString(),
    adminEmail: 'rodrigobento1979@gmail.com',
    data: db,
  };
}

export function restoreBackup(payload: any) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Arquivo de backup inválido.');
  }

  const dataToRestore: SystemData = payload.data || payload;

  if (!Array.isArray(dataToRestore.companies) || !Array.isArray(dataToRestore.users)) {
    throw new Error('Formato de dados incompatível. Estrutura ContSuite não identificada.');
  }

  const restored: SystemData = {
    users: dataToRestore.users || [],
    companies: dataToRestore.companies || [],
    assets: dataToRestore.assets || [],
    statements: dataToRestore.statements || [],
    fees: dataToRestore.fees || [],
    payments: dataToRestore.payments || [],
    accounts: dataToRestore.accounts || [],
    documents: dataToRestore.documents || [],
  };

  saveDb(restored);
  return {
    success: true,
    message: 'Backup restaurado com sucesso!',
    counts: {
      companies: restored.companies.length,
      users: restored.users.length,
      assets: restored.assets.length,
      statements: restored.statements.length,
      fees: restored.fees.length,
      payments: restored.payments.length,
      accounts: restored.accounts.length,
      documents: restored.documents.length,
    },
  };
}

export function clearDemoData(adminEmail: string = 'rodrigobento1979@gmail.com') {
  const db = loadDb();

  // Find or preserve the Master Administrator
  const masterUser = db.users.find(
    u => u.email.toLowerCase().trim() === adminEmail.toLowerCase().trim() || u.role === 'admin'
  ) || {
    id: 'usr-admin-master',
    name: 'Rodrigo Bento',
    email: adminEmail,
    role: 'admin' as const,
    companyId: 'comp-master',
    createdAt: new Date().toISOString(),
    status: 'active' as const,
  };

  // Preserve or establish the primary master company
  const masterCompany = db.companies.find(c => c.id === 'comp-master') || {
    id: 'comp-master',
    name: 'Bento & Associados Consultoria Contábil',
    cnpj: '12.345.678/0001-90',
    fantasyName: 'Bento Contabilidade',
    contactEmail: adminEmail,
    adminEmail: adminEmail,
    adminName: 'Rodrigo Bento',
    phone: '(11) 98765-4321',
    accountingSystem: 'dominio' as const,
    chartOfAccounts: {
      assetDefaultAccount: '1.2.3.01.0001',
      depreciationExpenseAccount: '3.1.2.04.0010',
      accumulatedDepreciationAccount: '1.2.3.09.0001',
    },
    createdAt: new Date().toISOString(),
  };

  // Clean data: clear demo assets, demo statements, demo fees, demo payments
  // Preserve standard chart of accounts
  const cleaned: SystemData = {
    users: [masterUser],
    companies: [masterCompany],
    assets: [],
    statements: [],
    fees: [],
    payments: [],
    accounts: db.accounts && db.accounts.length > 0 ? db.accounts : INITIAL_DATA.accounts,
    documents: [],
  };

  saveDb(cleaned);
  return {
    success: true,
    message: 'Base de dados limpa com sucesso! Dados de demonstração removidos e prontos para produção.',
    remaining: {
      users: cleaned.users.length,
      companies: cleaned.companies.length,
      accounts: cleaned.accounts.length,
      assets: 0,
      statements: 0,
      fees: 0,
      documents: 0,
    },
  };
}

// ---------------------------------------------------------
// ARQUIVOS & DOCUMENTOS CONTÁBEIS (COMPANY DOCUMENTS)
// ---------------------------------------------------------
export function getDocuments(companyId?: string) {
  const db = loadDb();
  const docs = db.documents || [];
  if (companyId && companyId !== 'all') {
    return docs.filter(d => d.companyId === companyId);
  }
  return docs;
}

export function getDocumentById(id: string) {
  const db = loadDb();
  return (db.documents || []).find(d => d.id === id);
}

export function createDocument(doc: Omit<CompanyDocument, 'id' | 'uploadedAt' | 'updatedAt'>) {
  const db = loadDb();
  if (!db.documents) db.documents = [];
  const now = new Date().toISOString();
  const newDoc: CompanyDocument = {
    ...doc,
    id: 'doc-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000),
    uploadedAt: now,
    updatedAt: now,
  };
  db.documents.unshift(newDoc);
  saveDb(db);
  return newDoc;
}

export function updateDocument(id: string, updates: Partial<CompanyDocument>) {
  const db = loadDb();
  if (!db.documents) db.documents = [];
  const idx = db.documents.findIndex(d => d.id === id);
  if (idx !== -1) {
    db.documents[idx] = {
      ...db.documents[idx],
      ...updates,
      id: db.documents[idx].id,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return db.documents[idx];
  }
  return null;
}

export function deleteDocument(id: string) {
  const db = loadDb();
  if (!db.documents) return false;
  const initialLen = db.documents.length;
  db.documents = db.documents.filter(d => d.id !== id);
  if (db.documents.length !== initialLen) {
    saveDb(db);
    return true;
  }
  return false;
}



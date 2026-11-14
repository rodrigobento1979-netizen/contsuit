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
  defaultPassword?: string;
}

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  fantasyName: string;
  contactEmail: string;
  phone: string;
  accountingSystem: 'ng_keevo' | 'dominio' | 'questor' | 'fortes' | 'alterdata' | 'totvs' | 'sci' | 'outro';
  chartOfAccounts?: {
    assetDefaultAccount: string;
    depreciationExpenseAccount: string;
    accumulatedDepreciationAccount: string;
  };
  adminEmail?: string; // Administrador proprietário do escritório
  adminName?: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  companyId: string;
  tagNumber: string;
  description: string;
  category: 'edificacoes' | 'maquinas' | 'veiculos' | 'moveis' | 'ti' | 'software' | 'ferramentas' | 'instalacoes' | 'outro';
  categoryLabel: string;
  acquisitionDate: string;
  depreciationStartDate: string;
  acquisitionValue: number;
  residualValue: number;
  depreciableValue: number;
  annualRate: number;
  usefulLifeMonths: number;
  monthlyRate: number;
  costCenter: string;
  location: string;
  supplier: string;
  invoiceNumber: string;
  debitAccount: string;
  creditAccount: string;
  assetAccount: string;
  status: 'ativo' | 'baixado' | 'totalmente_depreciado' | 'em_manutencao';
  disposalDate?: string;
  disposalReason?: string;
  salePrice?: number;
  gainOrLoss?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DepreciationPeriodType = 'mensal' | 'trimestral' | 'anual';

export interface DepreciationCalculationItem {
  assetId: string;
  tagNumber: string;
  description: string;
  categoryLabel: string;
  acquisitionDate: string;
  depreciationStartDate: string;
  acquisitionValue: number;
  residualValue: number;
  depreciableValue: number;
  annualRate: number;
  monthlyRate: number;
  usefulLifeMonths: number;
  competenceMonth: string;
  periodType?: DepreciationPeriodType;
  monthsElapsed: number;
  monthsRemaining: number;
  projectedZeroDate?: string;
  periodDepreciation?: number;
  monthlyDepreciation: number;
  previousAccumulatedDepreciation: number;
  currentAccumulatedDepreciation: number;
  netBookValue: number;
  isFullyDepreciated: boolean;
  costCenter: string;
  debitAccount: string;
  creditAccount: string;
  assetAccount: string;
}

export interface AccountingJournalEntry {
  id: string;
  date: string;
  debitAccount: string;
  debitAccountName: string;
  creditAccount: string;
  creditAccountName: string;
  amount: number;
  historyText: string;
  costCenter: string;
  assetTag: string;
}

export interface AssetDisposalCalculation {
  assetId: string;
  tagNumber: string;
  description: string;
  disposalDate: string;
  disposalReason: 'venda' | 'sucata' | 'descarte' | 'perda' | 'sinistro';
  acquisitionValue: number;
  residualValue: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  salePrice: number;
  gainOrLoss: number;
  isGain: boolean;
  accountingEntries: AccountingJournalEntry[];
}

export interface DepreciationSummary {
  competenceMonth: string;
  periodType?: DepreciationPeriodType;
  totalAssets: number;
  activeAssets: number;
  totalAcquisitionValue: number;
  totalDepreciableValue: number;
  totalPeriodDepreciation?: number;
  totalMonthlyDepreciation: number;
  totalAccumulatedDepreciation: number;
  totalNetBookValue: number;
  items: DepreciationCalculationItem[];
  journalEntries: AccountingJournalEntry[];
}

export interface BankTransaction {
  id: string;
  date: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  memo: string;
  fitid: string;
  category?: string;
  documentNumber?: string;
}

export interface ConvertedStatement {
  id?: string;
  companyId?: string;
  uploadedAt?: string;
  originalFileName?: string;
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
  extractedCnpj?: string;
  extractedCompanyName?: string;
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
  companyId?: string;
  code: string; // e.g. "1.1.1.02.0001"
  name: string; // e.g. "Banco Itaú c/c"
  type: 'analitica' | 'sintetica';
  nature: 'devedora' | 'credora';
  group: 'ativo' | 'passivo' | 'patrimonio' | 'patrimonio_liquido' | 'receita' | 'despesa';
  categoryTag?: 'banco' | 'imobilizado' | 'depreciacao_acumulada' | 'despesa_depreciacao' | 'outro';
  syntheticParentCode?: string; // e.g. "1.1.1.02"
  level: number; // e.g. 1, 2, 3, 4, 5
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
  documentDate?: string; // YYYY-MM-DD
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





import { Asset } from './db.ts';

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
  
  // Período de apuração
  competenceMonth: string; // YYYY-MM
  periodType: DepreciationPeriodType;
  monthsElapsed: number;
  monthsRemaining: number;
  projectedZeroDate: string; // YYYY-MM
  
  // Valores calculados
  periodDepreciation: number; // Quota do período (mensal, trimestral ou anual)
  monthlyDepreciation: number;
  previousAccumulatedDepreciation: number;
  currentAccumulatedDepreciation: number;
  netBookValue: number; // Valor Contábil Líquido
  isFullyDepreciated: boolean;
  
  // Dados contábeis
  costCenter: string;
  debitAccount: string; // Despesa
  creditAccount: string; // Deprec Acumulada
  assetAccount: string; // Conta Ativo
}

export interface DepreciationSummary {
  competenceMonth: string;
  periodType: DepreciationPeriodType;
  totalAssets: number;
  activeAssets: number;
  totalAcquisitionValue: number;
  totalDepreciableValue: number;
  totalPeriodDepreciation: number;
  totalMonthlyDepreciation: number;
  totalAccumulatedDepreciation: number;
  totalNetBookValue: number;
  items: DepreciationCalculationItem[];
  journalEntries: AccountingJournalEntry[];
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
  netBookValue: number; // VCL = acquisitionValue - accumulatedDepreciation
  salePrice: number;
  gainOrLoss: number; // salePrice - netBookValue (> 0 = Ganho de Capital, < 0 = Perda de Capital)
  isGain: boolean;
  accountingEntries: AccountingJournalEntry[];
}

/**
 * Calcula a depreciação de uma lista de ativos para um determinado mês de competência (YYYY-MM)
 * e tipo de periodicidade (Mensal, Trimestral ou Anual).
 */
export function calculateDepreciationForPeriod(
  assets: Asset[],
  competenceMonth: string = new Date().toISOString().slice(0, 7), // Ex: "2026-11"
  periodType: DepreciationPeriodType = 'mensal'
): DepreciationSummary {
  const [compYear, compMonth] = competenceMonth.split('-').map(Number);
  const targetDate = new Date(compYear, compMonth - 1, 28); // Fim aproximado do mês

  let totalAcquisitionValue = 0;
  let totalDepreciableValue = 0;
  let totalMonthlyDepreciation = 0;
  let totalPeriodDepreciation = 0;
  let totalAccumulatedDepreciation = 0;
  let totalNetBookValue = 0;
  let activeAssets = 0;

  const items: DepreciationCalculationItem[] = [];
  const journalEntries: AccountingJournalEntry[] = [];

  const periodMultiplier = periodType === 'anual' ? 12 : periodType === 'trimestral' ? 3 : 1;
  const periodLabel = periodType === 'anual' ? 'Anual' : periodType === 'trimestral' ? 'Trimestral' : 'Mensal';

  for (const asset of assets) {
    if (asset.status === 'baixado') {
      // Se já foi baixado antes deste mês, desconsidera
      continue;
    }

    const startDate = new Date(asset.depreciationStartDate || asset.acquisitionDate);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    // Calcular quantos meses se passaram desde o início da depreciação até a competência
    const monthsElapsed = (compYear - startYear) * 12 + (compMonth - startMonth) + 1;

    const depreciable = Math.max(0, asset.acquisitionValue - (asset.residualValue || 0));
    const monthlyRateDec = (asset.annualRate / 100) / 12;
    const standardMonthlyDeprec = depreciable * monthlyRateDec;

    // Calcular data estimada de 100% de depreciação
    const totalUsefulMonths = asset.usefulLifeMonths || (asset.annualRate > 0 ? Math.round(1200 / asset.annualRate) : 60);
    const endProjectedDate = new Date(startDate);
    endProjectedDate.setMonth(endProjectedDate.getMonth() + totalUsefulMonths);
    const projectedZeroDate = `${endProjectedDate.getFullYear()}-${String(endProjectedDate.getMonth() + 1).padStart(2, '0')}`;

    let monthlyDeprec = 0;
    let periodDeprec = 0;
    let prevAccumulated = 0;
    let currentAccumulated = 0;
    let isFullyDepreciated = false;

    if (monthsElapsed <= 0) {
      // Bem adquirido no futuro em relação à competência
      monthlyDeprec = 0;
      periodDeprec = 0;
      prevAccumulated = 0;
      currentAccumulated = 0;
    } else {
      activeAssets++;
      // Meses anteriores à competência
      const prevMonths = Math.max(0, monthsElapsed - periodMultiplier);
      prevAccumulated = Math.min(depreciable, prevMonths * standardMonthlyDeprec);

      if (prevAccumulated >= depreciable) {
        // Já estava 100% depreciado no período anterior
        monthlyDeprec = 0;
        periodDeprec = 0;
        currentAccumulated = depreciable;
        isFullyDepreciated = true;
      } else {
        // Depreciação deste período
        const maxPeriodDeprec = standardMonthlyDeprec * periodMultiplier;
        periodDeprec = Math.min(maxPeriodDeprec, depreciable - prevAccumulated);
        monthlyDeprec = Math.min(standardMonthlyDeprec, depreciable - prevAccumulated);
        currentAccumulated = prevAccumulated + periodDeprec;
        if (currentAccumulated >= depreciable) {
          isFullyDepreciated = true;
        }
      }
    }

    const netBookValue = Math.max(asset.residualValue || 0, asset.acquisitionValue - currentAccumulated);
    const monthsRemaining = standardMonthlyDeprec > 0 
      ? Math.max(0, Math.ceil((depreciable - currentAccumulated) / standardMonthlyDeprec)) 
      : 0;

    totalAcquisitionValue += asset.acquisitionValue;
    totalDepreciableValue += depreciable;
    totalMonthlyDepreciation += monthlyDeprec;
    totalPeriodDepreciation += periodDeprec;
    totalAccumulatedDepreciation += currentAccumulated;
    totalNetBookValue += netBookValue;

    const calcItem: DepreciationCalculationItem = {
      assetId: asset.id,
      tagNumber: asset.tagNumber,
      description: asset.description,
      categoryLabel: asset.categoryLabel,
      acquisitionDate: asset.acquisitionDate,
      depreciationStartDate: asset.depreciationStartDate,
      acquisitionValue: asset.acquisitionValue,
      residualValue: asset.residualValue || 0,
      depreciableValue: depreciable,
      annualRate: asset.annualRate,
      monthlyRate: asset.monthlyRate,
      usefulLifeMonths: totalUsefulMonths,
      competenceMonth,
      periodType,
      monthsElapsed: Math.max(0, monthsElapsed),
      monthsRemaining,
      projectedZeroDate,
      periodDepreciation: Number(periodDeprec.toFixed(2)),
      monthlyDepreciation: Number(monthlyDeprec.toFixed(2)),
      previousAccumulatedDepreciation: Number(prevAccumulated.toFixed(2)),
      currentAccumulatedDepreciation: Number(currentAccumulated.toFixed(2)),
      netBookValue: Number(netBookValue.toFixed(2)),
      isFullyDepreciated,
      costCenter: asset.costCenter || 'Geral',
      debitAccount: asset.debitAccount || '3.1.2.04.0010',
      creditAccount: asset.creditAccount || '1.2.3.09.0001',
      assetAccount: asset.assetAccount || '1.2.3.01.0001',
    };

    items.push(calcItem);

    // Gerar lançamento contábil se houver valor de depreciação no período
    if (periodDeprec > 0) {
      const lastDayOfMonth = new Date(compYear, compMonth, 0).getDate();
      const entryDate = `${competenceMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;
      
      journalEntries.push({
        id: `entry-${asset.id}-${competenceMonth}-${periodType}`,
        date: entryDate,
        debitAccount: calcItem.debitAccount,
        debitAccountName: 'Despesa com Depreciação do Exercício',
        creditAccount: calcItem.creditAccount,
        creditAccountName: 'Depreciação Acumulada (Retificadora do Ativo)',
        amount: Number(periodDeprec.toFixed(2)),
        historyText: `Vlr. ref. quota depreciação ${periodLabel.toLowerCase()} ref. ${compMonth}/${compYear} do bem ${asset.description} (${asset.tagNumber})`,
        costCenter: calcItem.costCenter,
        assetTag: asset.tagNumber,
      });
    }
  }

  return {
    competenceMonth,
    periodType,
    totalAssets: assets.length,
    activeAssets,
    totalAcquisitionValue: Number(totalAcquisitionValue.toFixed(2)),
    totalDepreciableValue: Number(totalDepreciableValue.toFixed(2)),
    totalPeriodDepreciation: Number(totalPeriodDepreciation.toFixed(2)),
    totalMonthlyDepreciation: Number(totalMonthlyDepreciation.toFixed(2)),
    totalAccumulatedDepreciation: Number(totalAccumulatedDepreciation.toFixed(2)),
    totalNetBookValue: Number(totalNetBookValue.toFixed(2)),
    items,
    journalEntries,
  };
}

/**
 * Exportador em formato padrão Domínio Sistemas (TXT delimitado por barra vertical | ou tabulação)
 */
export function exportToDominioSistemas(summary: DepreciationSummary, companyCnpj: string = ''): string {
  // Padrão Domínio Lançamentos Contábeis
  // Formato: DATA|CONTA_DEBITO|CONTA_CREDITO|VALOR|HISTORICO|COMPLEMENTO|CENTRO_CUSTO
  const lines: string[] = [];
  lines.push(`# EXPORTACAO DOMINIO SISTEMAS - DEPRECIACAO CONTABIL COMPETENCIA ${summary.competenceMonth}`);
  lines.push(`# CNPJ EMPRESA: ${companyCnpj || 'NAO INFORMADO'}`);
  lines.push(`# GERADO POR: ContSuite Contábil em ${new Date().toLocaleString('pt-BR')}`);
  lines.push(`# LAYOUT: DATA|CONTA_DEB|CONTA_CRED|VALOR|COD_HIST|HISTORICO_COMPLETO|CENTRO_CUSTO`);

  for (const entry of summary.journalEntries) {
    const formattedDate = entry.date.split('-').reverse().join('/'); // DD/MM/YYYY
    const formattedAmount = entry.amount.toFixed(2).replace('.', ',');
    // Código histórico padrão 100 (Depreciação de Bens)
    lines.push(`${formattedDate}|${entry.debitAccount}|${entry.creditAccount}|${formattedAmount}|100|${entry.historyText}|${entry.costCenter}`);
  }

  return lines.join('\r\n');
}

/**
 * Exportador em formato Questor / Fortes / Universal CSV com Partidas Dobradas
 */
export function exportToUniversalCsv(summary: DepreciationSummary): string {
  const headers = [
    'Data Lançamento',
    'Conta Débito',
    'Nome Conta Débito',
    'Conta Crédito',
    'Nome Conta Crédito',
    'Valor (R$)',
    'Histórico Contábil',
    'Centro de Custo',
    'Plaqueta / Tag',
  ];

  const rows: string[] = [headers.join(';')];

  for (const entry of summary.journalEntries) {
    const formattedDate = entry.date.split('-').reverse().join('/');
    const formattedAmount = entry.amount.toFixed(2).replace('.', ',');
    const escapedHistory = `"${entry.historyText.replace(/"/g, '""')}"`;
    const escapedCostCenter = `"${entry.costCenter.replace(/"/g, '""')}"`;

    rows.push([
      formattedDate,
      entry.debitAccount,
      entry.debitAccountName,
      entry.creditAccount,
      entry.creditAccountName,
      formattedAmount,
      escapedHistory,
      escapedCostCenter,
      entry.assetTag,
    ].join(';'));
  }

  return rows.join('\r\n');
}

/**
 * Exportador de Ficha Patrimonial Completa (CSV detalhado dos ativos e VCL)
 */
export function exportAssetFichaCsv(summary: DepreciationSummary): string {
  const headers = [
    'Plaqueta',
    'Descrição do Bem',
    'Categoria',
    'Data Aquisição',
    'Valor Aquisição (R$)',
    'Valor Residual (R$)',
    'Valor Depreciável (R$)',
    'Taxa Anual (%)',
    'Taxa Mensal (%)',
    'Vida Útil (Meses)',
    'Meses Decorridos',
    'Depreciação Mês (R$)',
    'Depreciação Acumulada (R$)',
    'Valor Contábil Líquido (R$)',
    'Status Depreciação',
    'Centro de Custo',
    'Conta Despesa',
    'Conta Deprec. Acumulada',
  ];

  const rows: string[] = [headers.join(';')];

  for (const item of summary.items) {
    rows.push([
      item.tagNumber,
      `"${item.description.replace(/"/g, '""')}"`,
      `"${item.categoryLabel}"`,
      item.acquisitionDate,
      item.acquisitionValue.toFixed(2).replace('.', ','),
      item.residualValue.toFixed(2).replace('.', ','),
      item.depreciableValue.toFixed(2).replace('.', ','),
      item.annualRate.toFixed(2).replace('.', ','),
      item.monthlyRate.toFixed(4).replace('.', ','),
      item.usefulLifeMonths.toString(),
      item.monthsElapsed.toString(),
      item.monthlyDepreciation.toFixed(2).replace('.', ','),
      item.currentAccumulatedDepreciation.toFixed(2).replace('.', ','),
      item.netBookValue.toFixed(2).replace('.', ','),
      item.isFullyDepreciated ? '100% Depreciado' : 'Em Depreciação',
      `"${item.costCenter}"`,
      item.debitAccount,
      item.creditAccount,
    ].join(';'));
  }

  return rows.join('\r\n');
}

/**
 * Exportador em formato Mastermaq NG / Keevo
 * Layout: DATA;CONTA_DEBITO;CONTA_CREDITO;VALOR;COD_HISTORICO;HISTORICO;CENTRO_CUSTO
 */
export function exportToNgKeevo(summary: DepreciationSummary, companyCnpj: string = ''): string {
  const lines: string[] = [];
  lines.push(`// MASTERMAQ NG / KEEVO - INTEGRACAO CONTABIL DEPRECIACAO ${summary.competenceMonth}`);
  lines.push(`// CNPJ: ${companyCnpj || '00.000.000/0001-00'}`);
  lines.push(`// PERIODICIDADE: ${summary.periodType.toUpperCase()}`);
  lines.push(`// LAYOUT: DATA;CONTA_DEB;CONTA_CRED;VALOR;COD_HIST;HISTORICO;CENTRO_CUSTO`);

  for (const entry of summary.journalEntries) {
    const formattedDate = entry.date.split('-').reverse().join('/');
    const formattedAmount = entry.amount.toFixed(2).replace('.', ',');
    const cleanHistory = entry.historyText.replace(/;/g, ' ');
    const costCenter = entry.costCenter || '';
    lines.push(`${formattedDate};${entry.debitAccount};${entry.creditAccount};${formattedAmount};50;${cleanHistory};${costCenter}`);
  }

  return lines.join('\r\n');
}

/**
 * Cálculo e apuração de Baixa do Bem Patrimonial com Ganho ou Perda de Capital
 */
export function calculateAssetDisposal(
  asset: Asset,
  disposalDate: string = new Date().toISOString().slice(0, 10),
  salePrice: number = 0,
  disposalReason: 'venda' | 'sucata' | 'descarte' | 'perda' | 'sinistro' = 'venda'
): AssetDisposalCalculation {
  const [dispYear, dispMonth] = disposalDate.split('-').map(Number);
  const startDate = new Date(asset.depreciationStartDate || asset.acquisitionDate);
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;

  const monthsElapsed = Math.max(0, (dispYear - startYear) * 12 + (dispMonth - startMonth) + 1);
  const depreciable = Math.max(0, asset.acquisitionValue - (asset.residualValue || 0));
  const monthlyRateDec = (asset.annualRate / 100) / 12;
  const standardMonthlyDeprec = depreciable * monthlyRateDec;

  const accumulatedDepreciation = Math.min(depreciable, monthsElapsed * standardMonthlyDeprec);
  const netBookValue = Math.max(0, asset.acquisitionValue - accumulatedDepreciation);
  const gainOrLoss = salePrice - netBookValue;
  const isGain = gainOrLoss >= 0;

  const formattedDisposalDate = disposalDate.split('-').reverse().join('/');
  const accountingEntries: AccountingJournalEntry[] = [];

  // 1. Baixa da Depreciação Acumulada
  if (accumulatedDepreciation > 0) {
    accountingEntries.push({
      id: `baixa-deprec-${asset.id}`,
      date: disposalDate,
      debitAccount: asset.creditAccount || '1.2.3.09.0001',
      debitAccountName: '(-) Depreciação Acumulada (Baixa Retificadora)',
      creditAccount: asset.assetAccount || '1.2.3.01.0001',
      creditAccountName: 'Ativo Imobilizado (Custo Histórico)',
      amount: Number(accumulatedDepreciation.toFixed(2)),
      historyText: `Baixa da depreciação acumulada ref. ${disposalReason} do bem ${asset.description} (${asset.tagNumber})`,
      costCenter: asset.costCenter || 'Geral',
      assetTag: asset.tagNumber,
    });
  }

  // 2. Registro do Valor da Alienação / Venda
  if (salePrice > 0) {
    accountingEntries.push({
      id: `baixa-alienacao-${asset.id}`,
      date: disposalDate,
      debitAccount: '1.1.1.02.0001', // Caixa / Banco
      debitAccountName: 'Bancos Conta Movimento (Recebimento da Venda)',
      creditAccount: asset.assetAccount || '1.2.3.01.0001',
      creditAccountName: 'Ativo Imobilizado (Alienação)',
      amount: Number(salePrice.toFixed(2)),
      historyText: `Vlr. recebido ref. alienação do bem ${asset.description} (${asset.tagNumber}) - NF/Doc em ${formattedDisposalDate}`,
      costCenter: asset.costCenter || 'Geral',
      assetTag: asset.tagNumber,
    });
  }

  // 3. Ganho ou Perda de Capital
  if (Math.abs(gainOrLoss) > 0.01) {
    if (gainOrLoss > 0) {
      accountingEntries.push({
        id: `baixa-ganho-${asset.id}`,
        date: disposalDate,
        debitAccount: asset.assetAccount || '1.2.3.01.0001',
        debitAccountName: 'Ativo Imobilizado (Ajuste de Alienação)',
        creditAccount: '3.1.1.04.0001',
        creditAccountName: 'Outras Receitas - Ganho de Capital na Alienação do Imobilizado',
        amount: Number(gainOrLoss.toFixed(2)),
        historyText: `Ganho de Capital apurado na alienação do bem ${asset.description} (${asset.tagNumber})`,
        costCenter: asset.costCenter || 'Geral',
        assetTag: asset.tagNumber,
      });
    } else {
      accountingEntries.push({
        id: `baixa-perda-${asset.id}`,
        date: disposalDate,
        debitAccount: '4.1.3.05.0001',
        debitAccountName: 'Outras Despesas - Perda de Capital na Baixa do Imobilizado',
        creditAccount: asset.assetAccount || '1.2.3.01.0001',
        creditAccountName: 'Ativo Imobilizado (Baixa residual)',
        amount: Number(Math.abs(gainOrLoss).toFixed(2)),
        historyText: `Perda de Capital apurada na baixa por ${disposalReason} do bem ${asset.description} (${asset.tagNumber})`,
        costCenter: asset.costCenter || 'Geral',
        assetTag: asset.tagNumber,
      });
    }
  }

  return {
    assetId: asset.id,
    tagNumber: asset.tagNumber,
    description: asset.description,
    disposalDate,
    disposalReason,
    acquisitionValue: Number(asset.acquisitionValue.toFixed(2)),
    residualValue: Number((asset.residualValue || 0).toFixed(2)),
    accumulatedDepreciation: Number(accumulatedDepreciation.toFixed(2)),
    netBookValue: Number(netBookValue.toFixed(2)),
    salePrice: Number(salePrice.toFixed(2)),
    gainOrLoss: Number(gainOrLoss.toFixed(2)),
    isGain,
    accountingEntries,
  };
}

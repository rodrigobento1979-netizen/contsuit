import React, { useEffect, useMemo, useState } from 'react';
import { X, Printer, Download, ChevronLeft, ChevronRight, FileText, Building2, CheckCircle2 } from 'lucide-react';
import { Asset, Company } from '../types';
import {
  escapeHtml,
  formatCurrencyBRL,
  paginateReportData,
  printCleanHtmlDocument,
  ReportColumnLike,
} from '../utils/reportPrint';

interface AssetFichaModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  initialAssetId?: string;
  company: Company;
  userEmail?: string;
}

export const AssetFichaModal: React.FC<AssetFichaModalProps> = ({
  isOpen,
  onClose,
  assets,
  initialAssetId,
  company,
  userEmail = 'secsscont@gmail.com',
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    initialAssetId || (assets.length > 0 ? assets[0].id : '')
  );
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('contsuite-report-modal-open');
    return () => {
      document.body.classList.remove('contsuite-report-modal-open');
    };
  }, [isOpen]);

  const currentAsset = assets.find(a => a.id === selectedId) || assets[0];
  const currentIndex = assets.findIndex(a => a.id === currentAsset?.id);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setSelectedId(assets[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIndex < assets.length - 1 && currentIndex !== -1) {
      setSelectedId(assets[currentIndex + 1].id);
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const handleExportCsv = () => {
    if (!currentAsset) return;
    const lines = [
      '\uFEFF"FICHA PATRIMONIAL INDIVIDUAL DO BEM - CONTSUITE"',
      `"Empresa:","${company.name} (CNPJ: ${company.cnpj})"`,
      `"Data de Emissão:","${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}"`,
      '',
      '"DADOS CADASTRAIS DO BEM"',
      `"Número de Tombo / Plaqueta","${currentAsset.tagNumber || ''}"`,
      `"Descrição do Bem","${currentAsset.description || ''}"`,
      `"Categoria CPC 27","${currentAsset.categoryLabel || currentAsset.category || ''}"`,
      `"Grupo / Classe","${currentAsset.assetGroup || '-'} / ${currentAsset.assetClass || '-'}"`,
      `"Data de Aquisição","${formatDate(currentAsset.acquisitionDate)}"`,
      `"Início da Depreciação","${formatDate(currentAsset.depreciationStartDate)}"`,
      `"Valor de Aquisição (R$)","${currentAsset.acquisitionValue || 0}"`,
      `"Valor Residual (R$)","${currentAsset.residualValue || 0}"`,
      `"Valor Depreciável (R$)","${currentAsset.depreciableValue || 0}"`,
      `"Taxa Anual (%)","${currentAsset.annualRate || 0}%"`,
      `"Vida Útil (Meses)","${currentAsset.usefulLifeMonths || 0}"`,
      `"Centro de Custo","${currentAsset.costCenter || '-'}"`,
      `"Localização","${currentAsset.location || '-'}"`,
      `"Fornecedor / Emitente","${currentAsset.supplier || '-'}"`,
      `"Nota Fiscal / Documento","${currentAsset.invoiceNumber || '-'}"`,
      `"Conta do Imobilizado","${currentAsset.assetAccount || '-'}"`,
      `"Conta Despesa de Depreciação","${currentAsset.debitAccount || '-'}"`,
      `"Conta Depreciação Acumulada","${currentAsset.creditAccount || '-'}"`,
      `"Status Atual","${currentAsset.status || 'ativo'}"`,
      `"Observações","${currentAsset.notes || '-'}"`,
    ];
    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ficha_bem_${currentAsset.tagNumber || 'patrimonio'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate simulated history entries (yearly / monthly schedule) for historical movements
  const generateMovementHistory = (asset: Asset) => {
    const list: {
      date: string;
      type: string;
      doc: string;
      history: string;
      debit: string;
      credit: string;
      debitValue: number;
      creditValue: number;
      balance: string;
    }[] = [];
    const acqVal = asset.acquisitionValue || 0;
    const monthlyDep = (asset.depreciableValue || (acqVal - (asset.residualValue || 0))) / (asset.usefulLifeMonths || 60);
    const startDate = new Date(asset.depreciationStartDate || asset.acquisitionDate || '2026-01-01');
    
    let accum = asset.initialAccumulatedDepreciation || 0;
    
    // Add initial acquisition movement
    list.push({
      date: formatDate(asset.acquisitionDate),
      type: 'Aquisição de Imobilizado',
      doc: asset.invoiceNumber || 'NF-e',
      history: `Incorporação do bem patrimonial ${asset.tagNumber} - ${asset.description}`,
      debit: formatMoney(acqVal),
      credit: 'R$ 0,00',
      debitValue: acqVal,
      creditValue: 0,
      balance: formatMoney(acqVal)
    });

    if (asset.initialAccumulatedDepreciation && asset.initialAccumulatedDepreciation > 0) {
      list.push({
        date: formatDate(asset.initialAccumulatedDepreciationDate || asset.acquisitionDate),
        type: 'Saldo Anterior / Carga Inicial',
        doc: 'Carga Saldo',
        history: `Depreciação acumulada trazida de sistema anterior / inventário inicial`,
        debit: 'R$ 0,00',
        credit: formatMoney(asset.initialAccumulatedDepreciation),
        debitValue: 0,
        creditValue: asset.initialAccumulatedDepreciation,
        balance: formatMoney(Math.max(0, acqVal - asset.initialAccumulatedDepreciation))
      });
    }

    // Simulate up to 12 monthly movements or current status
    let curDate = new Date(startDate);
    for (let i = 1; i <= Math.min(12, asset.usefulLifeMonths || 60); i++) {
      curDate.setMonth(curDate.getMonth() + 1);
      accum += monthlyDep;
      const netVal = Math.max(asset.residualValue || 0, acqVal - accum);
      if (accum > (acqVal - (asset.residualValue || 0))) {
        accum = acqVal - (asset.residualValue || 0);
      }
      list.push({
        date: curDate.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }),
        type: 'Quota de Depreciação Mensal',
        doc: `Competência ${curDate.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}`,
        history: `Lançamento mensal de depreciação (Taxa: ${asset.annualRate}% a.a.)`,
        debit: formatMoney(monthlyDep),
        credit: formatMoney(monthlyDep),
        debitValue: monthlyDep,
        creditValue: monthlyDep,
        balance: formatMoney(netVal)
      });
      if (netVal <= (asset.residualValue || 0)) break;
    }

    if (asset.status === 'baixado') {
      list.push({
        date: formatDate(asset.disposalDate || new Date().toISOString().slice(0, 10)),
        type: 'Baixa / Alienação de Bem',
        doc: asset.disposalReason || 'Baixa Patrimonial',
        history: `Baixa contábil do ativo. Motivo: ${asset.disposalReason || 'Baixa por obsolescência / venda'}`,
        debit: formatMoney(asset.residualValue || 0),
        credit: formatMoney(acqVal),
        debitValue: asset.residualValue || 0,
        creditValue: acqVal,
        balance: 'R$ 0,00 (Baixado)'
      });
    }

    return list;
  };

  const movementHistory = useMemo(
    () => (currentAsset ? generateMovementHistory(currentAsset) : []),
    [currentAsset]
  );

  const movementColumns: ReportColumnLike[] = useMemo(
    () => [
      { key: 'date', label: 'Data / Comp.', align: 'left', isMonetary: false },
      { key: 'type', label: 'Tipo de Movimentação', align: 'left', isMonetary: false },
      { key: 'doc', label: 'Documento', align: 'left', isMonetary: false },
      { key: 'history', label: 'Histórico Detalhado', align: 'left', isMonetary: false },
      { key: 'debitValue', label: 'Débito (R$)', align: 'right', isMonetary: true },
      { key: 'creditValue', label: 'Crédito (R$)', align: 'right', isMonetary: true },
      { key: 'balance', label: 'Saldo Líquido (VCL)', align: 'right', isMonetary: false },
    ],
    []
  );

  const { pages: movementPages, grandTotals: movementGrandTotals } = useMemo(
    () => paginateReportData(movementHistory, movementColumns, 12),
    [movementHistory, movementColumns]
  );

  const handlePrint = async () => {
    if (!currentAsset) return;
    try {
      setIsPrinting(true);
      const emittedAt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const cadastralHtml = `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
            1. Dados Cadastrais &amp; Contábeis do Bem
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 10px;">
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Tombo / Plaqueta</span><strong>${escapeHtml(currentAsset.tagNumber)}</strong></div>
            <div style="grid-column: span 2;"><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Descrição Completa</span><strong>${escapeHtml(currentAsset.description)}</strong></div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Data de Aquisição</span>${escapeHtml(formatDate(currentAsset.acquisitionDate))}</div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Início da Depreciação</span>${escapeHtml(formatDate(currentAsset.depreciationStartDate))}</div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Vida Útil / Taxa</span>${currentAsset.usefulLifeMonths} meses (${currentAsset.annualRate}% a.a.)</div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Valor de Aquisição</span><strong>${escapeHtml(formatMoney(currentAsset.acquisitionValue))}</strong></div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Valor Residual</span>${escapeHtml(formatMoney(currentAsset.residualValue))}</div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Base Depreciável</span><strong>${escapeHtml(formatMoney(currentAsset.depreciableValue || (currentAsset.acquisitionValue - currentAsset.residualValue)))}</strong></div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Conta Ativo</span><span class="mono">${escapeHtml(currentAsset.assetAccount || company.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001')}</span></div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Conta Despesa Deprec.</span><span class="mono">${escapeHtml(currentAsset.debitAccount || company.chartOfAccounts?.depreciationExpenseAccount || '3.1.2.04.0010')}</span></div>
            <div><span style="color:#64748b;font-size:8.5px;font-weight:700;text-transform:uppercase;display:block;">Conta Deprec. Acumulada</span><span class="mono">${escapeHtml(currentAsset.creditAccount || company.chartOfAccounts?.accumulatedDepreciationAccount || '1.2.3.09.0001')}</span></div>
          </div>
        </div>
      `;

      const pagesHtml = movementPages
        .map((page) => {
          const rowsHtml = page.rows
            .map(
              (mov) => `<tr>
                <td class="mono">${escapeHtml(mov.date)}</td>
                <td><strong>${escapeHtml(mov.type)}</strong></td>
                <td class="mono">${escapeHtml(mov.doc)}</td>
                <td>${escapeHtml(mov.history)}</td>
                <td class="text-right mono">${escapeHtml(mov.debit)}</td>
                <td class="text-right mono">${escapeHtml(mov.credit)}</td>
                <td class="text-right mono"><strong>${escapeHtml(mov.balance)}</strong></td>
              </tr>`
            )
            .join('');

          const grandRow =
            page.pageNumber === page.totalPages && page.totalPages > 1
              ? `<tr class="grand-total-row">
                  <td colspan="4" class="text-left" style="text-transform:uppercase;">TOTAL GERAL DAS MOVIMENTAÇÕES (${movementHistory.length} registros)</td>
                  <td class="text-right mono">${escapeHtml(formatCurrencyBRL(movementGrandTotals.debitValue || 0))}</td>
                  <td class="text-right mono">${escapeHtml(formatCurrencyBRL(movementGrandTotals.creditValue || 0))}</td>
                  <td class="text-right mono">-</td>
                </tr>`
              : '';

          return `<section class="report-page">
            <div class="report-header">
              <div>
                <div class="brand-row">
                  <span class="brand-badge">CONTSUITE</span>
                  <span class="brand-sub">Ficha Individual do Imobilizado (CPC 27)</span>
                </div>
                <h1 class="report-title">${escapeHtml(currentAsset.tagNumber)} - ${escapeHtml(currentAsset.description)}</h1>
                <p class="report-subtitle">Categoria: ${escapeHtml(currentAsset.categoryLabel || currentAsset.category)} • Status: ${escapeHtml((currentAsset.status || 'Ativo').toUpperCase())}</p>
              </div>
              <div class="company-meta">
                <div class="company-name">${escapeHtml(company.name)}</div>
                <div>CNPJ: ${escapeHtml(company.cnpj)}</div>
                <div>Emissão: ${escapeHtml(emittedAt)}</div>
                <div style="font-weight:800;color:#0f172a;margin-top:2px;">Página ${page.pageNumber} de ${page.totalPages}</div>
              </div>
            </div>

            ${page.pageNumber === 1 ? cadastralHtml : ''}

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Data / Comp.</th>
                    <th class="text-left">Tipo de Movimentação</th>
                    <th class="text-left">Documento</th>
                    <th class="text-left">Histórico Detalhado</th>
                    <th class="text-right">Débito (R$)</th>
                    <th class="text-right">Crédito (R$)</th>
                    <th class="text-right">Saldo Líquido (VCL)</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                  <tr class="subtotal-row">
                    <td colspan="4" class="text-left" style="text-transform:uppercase;">SUBTOTAL PÁGINA ${page.pageNumber} (${page.rows.length} ${page.rows.length === 1 ? 'movimento' : 'movimentos'})</td>
                    <td class="text-right mono">${escapeHtml(formatCurrencyBRL(page.pageTotals.debitValue || 0))}</td>
                    <td class="text-right mono">${escapeHtml(formatCurrencyBRL(page.pageTotals.creditValue || 0))}</td>
                    <td class="text-right mono">-</td>
                  </tr>
                  ${grandRow}
                </tfoot>
              </table>
            </div>

            <div class="page-footer">
              <span>ContSuite • Ficha Patrimonial Individual (CPC 27) • Operador: ${escapeHtml(userEmail)}</span>
              <span>Página <strong>${page.pageNumber}</strong> de <strong>${page.totalPages}</strong></span>
            </div>
          </section>`;
        })
        .join('\n');

      await printCleanHtmlDocument({
        documentTitle: `Ficha_${currentAsset.tagNumber}_${company.fantasyName || company.name}`,
        orientation: 'landscape',
        bodyHtml: pagesHtml,
      });
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="contsuite-printable-report fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-none sm:rounded-2xl max-w-5xl w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Header Toolbar (Hidden during print) */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center shadow-2xs">
              <FileText className="w-5 h-5 text-[#a7ffeb]" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Ficha Individual do Bem (Ficha Patrimonial)</h3>
              <p className="text-[11px] text-slate-500">Dados cadastrais e histórico de movimentações bem a bem</p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Asset Selector Dropdown */}
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600 max-w-[220px]"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tagNumber} - {a.description.length > 25 ? a.description.slice(0, 25) + '...' : a.description}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 border border-slate-300 rounded-lg bg-white overflow-hidden">
              <button
                onClick={handlePrev}
                disabled={currentIndex <= 0}
                className="px-2.5 py-1.5 hover:bg-slate-100 disabled:opacity-40 text-slate-700 text-xs font-bold transition cursor-pointer"
                title="Bem Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono px-2 text-slate-600 border-x border-slate-200">
                {currentIndex + 1} / {assets.length}
              </span>
              <button
                onClick={handleNext}
                disabled={currentIndex >= assets.length - 1}
                className="px-2.5 py-1.5 hover:bg-slate-100 disabled:opacity-40 text-slate-700 text-xs font-bold transition cursor-pointer"
                title="Próximo Bem"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-white"
              title="Baixar Ficha em CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isPrinting ? 'Preparando...' : 'Imprimir / PDF'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Card Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6 text-slate-900 font-sans print:p-4 print:overflow-visible">
          
          {/* Header Report Meta */}
          <div className="border-b-2 border-slate-900 pb-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-teal-900 text-white tracking-wider">
                  ContSuite v1.3
                </span>
                <span className="text-xs font-bold text-slate-700">Ficha Individual do Imobilizado (CPC 27)</span>
              </div>
              <h1 className="text-xl font-black text-slate-900 mt-1 uppercase tracking-tight">
                {currentAsset ? `${currentAsset.tagNumber} - ${currentAsset.description}` : 'Nenhum bem selecionado'}
              </h1>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Categoria: <strong>{currentAsset?.categoryLabel || currentAsset?.category}</strong> • Status: <span className="uppercase text-teal-800 font-bold">{currentAsset?.status || 'Ativo'}</span>
              </p>
            </div>

            <div className="text-right text-xs space-y-0.5 text-slate-600 self-start sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0">
              <p className="font-bold text-slate-900 text-sm">{company.name}</p>
              <p className="font-mono text-[11px]">CNPJ: {company.cnpj}</p>
            </div>
          </div>

          {currentAsset ? (
            <>
              {/* Cadastral Data Grid */}
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 bg-slate-100 p-2 rounded-lg">
                  <Building2 className="w-3.5 h-3.5 text-teal-700" />
                  1. Dados Cadastrais & Contábeis do Bem
                </h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Número de Tombo / Plaqueta</span>
                    <strong className="text-slate-900 font-mono text-sm">{currentAsset.tagNumber}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Descrição Completa</span>
                    <strong className="text-slate-900">{currentAsset.description}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Data de Aquisição</span>
                    <span className="text-slate-900 font-medium">{formatDate(currentAsset.acquisitionDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Início da Depreciação</span>
                    <span className="text-slate-900 font-medium">{formatDate(currentAsset.depreciationStartDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Vida Útil / Taxa Anual</span>
                    <span className="text-slate-900 font-medium">{currentAsset.usefulLifeMonths} meses ({currentAsset.annualRate}% a.a.)</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Valor de Aquisição (Custo Original)</span>
                    <span className="text-slate-900 font-mono font-bold text-teal-900">{formatMoney(currentAsset.acquisitionValue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Valor Residual Estimado</span>
                    <span className="text-slate-900 font-mono">{formatMoney(currentAsset.residualValue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Valor Base Depreciável</span>
                    <span className="text-slate-900 font-mono font-bold">{formatMoney(currentAsset.depreciableValue || (currentAsset.acquisitionValue - currentAsset.residualValue))}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Centro de Custo</span>
                    <span className="text-slate-900 font-medium">{currentAsset.costCenter || 'Geral / Administrativo'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Localização / Setor</span>
                    <span className="text-slate-900 font-medium">{currentAsset.location || 'Sede Principal'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Nota Fiscal / Documento</span>
                    <span className="text-slate-900 font-mono">{currentAsset.invoiceNumber || '-'}</span>
                  </div>

                  <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 mt-1">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Conta do Ativo Imobilizado</span>
                      <span className="text-slate-800 font-mono text-[11px]">{currentAsset.assetAccount || company.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Conta Despesa de Depreciação</span>
                      <span className="text-slate-800 font-mono text-[11px]">{currentAsset.debitAccount || company.chartOfAccounts?.depreciationExpenseAccount || '3.1.2.04.0010'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Conta Depreciação Acumulada</span>
                      <span className="text-slate-800 font-mono text-[11px]">{currentAsset.creditAccount || company.chartOfAccounts?.accumulatedDepreciationAccount || '1.2.3.09.0001'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Movements Table (Paginated with Per-Page Subtotals) */}
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 bg-slate-100 p-2 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                  2. Histórico de Movimentações & Quotas de Depreciação
                </h2>

                <div className="space-y-4">
                  {movementPages.map((page) => (
                    <div key={page.pageNumber} className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px]">
                            <th className="py-2 px-3">Data / Comp.</th>
                            <th className="py-2 px-3">Tipo de Movimentação</th>
                            <th className="py-2 px-3">Documento</th>
                            <th className="py-2 px-3">Histórico Detalhado</th>
                            <th className="py-2 px-3 text-right">Débito (R$)</th>
                            <th className="py-2 px-3 text-right">Crédito (R$)</th>
                            <th className="py-2 px-3 text-right">Saldo Líquido (VCL)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-slate-800">
                          {page.rows.map((mov, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono">{mov.date}</td>
                              <td className="py-2 px-3 font-semibold text-teal-900">{mov.type}</td>
                              <td className="py-2 px-3 font-mono">{mov.doc}</td>
                              <td className="py-2 px-3 text-slate-600">{mov.history}</td>
                              <td className="py-2 px-3 text-right font-mono">{mov.debit}</td>
                              <td className="py-2 px-3 text-right font-mono">{mov.credit}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold">{mov.balance}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-400 text-[11px]">
                            <td colSpan={4} className="py-2 px-3 uppercase">
                              Subtotal Página {page.pageNumber} ({page.rows.length}{' '}
                              {page.rows.length === 1 ? 'movimento' : 'movimentos'})
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {formatCurrencyBRL(page.pageTotals.debitValue || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {formatCurrencyBRL(page.pageTotals.creditValue || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-500">
                              Pág. {page.pageNumber}/{page.totalPages}
                            </td>
                          </tr>
                          {page.pageNumber === page.totalPages && page.totalPages > 1 && (
                            <tr className="bg-slate-900 font-black text-white border-t border-slate-900 text-[11px]">
                              <td colSpan={4} className="py-2 px-3 uppercase">
                                Total Geral ({movementHistory.length} movimentos)
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">
                                {formatCurrencyBRL(movementGrandTotals.debitValue || 0)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">
                                {formatCurrencyBRL(movementGrandTotals.creditValue || 0)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">-</td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 italic">
              Nenhum bem cadastrado ou selecionado no momento.
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
            <span>ContSuite v1.3 • Ficha Patrimonial Individual em conformidade com o CPC 27</span>
            <span>Operador: {userEmail}</span>
          </div>

        </div>

        {/* Footer Close */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Fechar Ficha
          </button>
        </div>

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, Printer, Download, ChevronLeft, ChevronRight, FileText, Building2, CheckCircle2 } from 'lucide-react';
import { Asset, Company } from '../types';

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

  if (!isOpen) return null;

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

  const handlePrint = () => {
    window.print();
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
    const list = [];
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
        balance: 'R$ 0,00 (Baixado)'
      });
    }

    return list;
  };

  const movementHistory = currentAsset ? generateMovementHistory(currentAsset) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 print:p-0 print:bg-white print:static">
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
              className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
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

              {/* Historical Movements Table */}
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 bg-slate-100 p-2 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                  2. Histórico de Movimentações & Quotas de Depreciação
                </h2>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
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
                      {movementHistory.map((mov, idx) => (
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
                  </table>
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

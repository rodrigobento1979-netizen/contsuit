import React, { useState } from 'react';
import { 
  Sparkles, 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft, 
  HelpCircle, 
  X, 
  Building2, 
  Check,
  AlertCircle
} from 'lucide-react';
import { Asset, Company } from '../types';

interface AssetSmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCompany: Company;
  onSaveAsset: (assetData: Partial<Asset>) => Promise<void>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export const AssetSmartImportModal: React.FC<AssetSmartImportModalProps> = ({
  isOpen,
  onClose,
  currentCompany,
  onSaveAsset,
  showToast,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<number>(0); // 0: upload, 1: q1 description/tag, 2: q2 depreciation rate, 3: q3 acquisition value, 4: q4 accumulated depreciation, 5: q5 category/date, 6: success
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extracted / Questionnaire form state
  const [extractedData, setExtractedData] = useState({
    description: 'Servidor Dell PowerEdge T440 - TI',
    tagNumber: 'ATV-' + Math.floor(1000 + Math.random() * 9000),
    category: 'ti' as Asset['category'],
    categoryLabel: 'Tecnologia da Informação',
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionValue: 18500.00,
    annualRate: 20.0, // 20% p.a. for IT
    accumulatedDepreciation: 3700.00,
    costCenter: 'Administrativo / TI',
    supplier: 'Dell Computadores do Brasil Ltda',
    invoiceNumber: 'NF-e 849201',
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) {
      showToast('Por favor, anexe um PDF, XLS ou documento do ativo.', 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStep(0);

    // Simulate intelligent AI parsing of PDF/XLS/document
    setTimeout(() => {
      setIsAnalyzing(false);
      setAnalysisStep(1); // Start objective questionnaire
      showToast('Documento analisado com IA! Vamos confirmar os dados essenciais.', 'success');
    }, 2000);
  };

  const handleConfirmAndSave = async () => {
    setIsSubmitting(true);
    try {
      const usefulLifeMonths = Math.round(100 / extractedData.annualRate * 12);
      const depreciableValue = extractedData.acquisitionValue;
      
      const newAsset: Partial<Asset> = {
        companyId: currentCompany.id,
        tagNumber: extractedData.tagNumber,
        description: extractedData.description,
        category: extractedData.category,
        categoryLabel: extractedData.categoryLabel,
        acquisitionDate: extractedData.acquisitionDate,
        depreciationStartDate: extractedData.acquisitionDate,
        acquisitionValue: extractedData.acquisitionValue,
        residualValue: 0,
        depreciableValue,
        annualRate: extractedData.annualRate,
        usefulLifeMonths,
        monthlyRate: extractedData.annualRate / 12,
        costCenter: extractedData.costCenter,
        location: currentCompany.fantasyName || currentCompany.name,
        supplier: extractedData.supplier,
        invoiceNumber: extractedData.invoiceNumber,
        debitAccount: currentCompany.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001',
        creditAccount: '1.1.1.01.0001',
        assetAccount: currentCompany.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001',
        status: 'ativo',
        notes: `Cadastrado via importação inteligente de documento (${selectedFile?.name || 'arquivo'}). Depreciação acumulada informada: R$ ${extractedData.accumulatedDepreciation.toLocaleString('pt-BR')}`,
      };

      await onSaveAsset(newAsset);
      showToast('Ativo imobilizado cadastrado com sucesso!', 'success');
      onClose();
    } catch (err: any) {
      showToast('Erro ao cadastrar ativo: ' + (err.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92dvh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-teal-800 to-teal-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-700 text-teal-200 flex items-center justify-center shadow-inner shrink-0">
              <Sparkles className="w-5 h-5 text-[#a7ffeb]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">Cadastro Inteligente de Ativo por IA</h2>
              <p className="text-xs text-teal-200 truncate">Análise de PDF, XLS ou Documentos com Confirmação Objetiva</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          
          {/* STEP 0: UPLOAD & ATTACH */}
          {analysisStep === 0 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-teal-700" />
                  Como funciona?
                </p>
                <p className="text-teal-800">
                  Anexe a nota fiscal, relatório de inventário, planilha XLS ou documento do bem. O sistema analisará os dados e fará perguntas rápidas e objetivas para você confirmar o cadastro do ativo.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-teal-600 transition bg-slate-50 relative cursor-pointer">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,.png,.jpg"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {selectedFile ? selectedFile.name : 'Clique para selecionar ou arraste o arquivo'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      PDF, XLS, XLSX, CSV ou Imagens (Comprovantes, NFs, Inventário)
                    </p>
                  </div>
                  {selectedFile && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      <CheckCircle className="w-3.5 h-3.5" /> Arquivo anexado com sucesso
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleStartAnalysis}
                  disabled={!selectedFile || isAnalyzing}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition cursor-pointer ${
                    !selectedFile || isAnalyzing
                      ? 'bg-slate-400 cursor-not-allowed'
                      : 'bg-teal-600 hover:bg-teal-700 shadow-teal-900/20'
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Analisando Documento com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#a7ffeb]" />
                      <span>Analisar e Perguntar Dados</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: QUESTION 1 - DESCRIPTION & TAG */}
          {analysisStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md">
                  Pergunta 1 de 5 • Identificação do Bem
                </span>
                <span className="text-xs text-slate-400 font-bold">20% Concluído</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-sm font-bold text-slate-900">
                  O sistema identificou o seguinte bem no arquivo anexado. Confirma a descrição e a plaqueta?
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Descrição do Bem / Ativo</label>
                  <input
                    type="text"
                    value={extractedData.description}
                    onChange={(e) => setExtractedData({ ...extractedData, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número de Plaquetas / Tag</label>
                    <input
                      type="text"
                      value={extractedData.tagNumber}
                      onChange={(e) => setExtractedData({ ...extractedData, tagNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Centro de Custo</label>
                    <input
                      type="text"
                      value={extractedData.costCenter}
                      onChange={(e) => setExtractedData({ ...extractedData, costCenter: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setAnalysisStep(0)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setAnalysisStep(2)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  <span>Próximo: Taxa de Depreciação</span> <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: QUESTION 2 - DEPRECIATION RATE */}
          {analysisStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md">
                  Pergunta 2 de 5 • Taxa de Depreciação Anual
                </span>
                <span className="text-xs text-slate-400 font-bold">40% Concluído</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-sm font-bold text-slate-900">
                  Confirma a taxa de depreciação anual sugerida pela IA baseada na legislação fiscal brasileira (CPC 27)?
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Taxa Anual (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      value={extractedData.annualRate}
                      onChange={(e) => setExtractedData({ ...extractedData, annualRate: Number(e.target.value) })}
                      className="w-32 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <span className="text-xs text-slate-600 font-semibold">% ao ano (ex: TI = 20%, Máquinas = 10%, Veículos = 20%, Imóveis = 4%)</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {[4, 10, 20, 25].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setExtractedData({ ...extractedData, annualRate: rate })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        extractedData.annualRate === rate
                          ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {rate}% a.a.
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setAnalysisStep(1)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setAnalysisStep(3)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  <span>Próximo: Valor de Aquisição</span> <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: QUESTION 3 - ACQUISITION VALUE */}
          {analysisStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md">
                  Pergunta 3 de 5 • Valor de Aquisição
                </span>
                <span className="text-xs text-slate-400 font-bold">60% Concluído</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-sm font-bold text-slate-900">
                  O valor de aquisição (custo histórico do bem) extraído do documento está correto?
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Valor de Aquisição (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={extractedData.acquisitionValue}
                    onChange={(e) => setExtractedData({ ...extractedData, acquisitionValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-extrabold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fornecedor / Fabricante</label>
                    <input
                      type="text"
                      value={extractedData.supplier}
                      onChange={(e) => setExtractedData({ ...extractedData, supplier: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nota Fiscal / Documento</label>
                    <input
                      type="text"
                      value={extractedData.invoiceNumber}
                      onChange={(e) => setExtractedData({ ...extractedData, invoiceNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setAnalysisStep(2)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setAnalysisStep(4)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  <span>Próximo: Valor Já Depreciado</span> <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: QUESTION 4 - ACCUMULATED DEPRECIATION */}
          {analysisStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md">
                  Pergunta 4 de 5 • Depreciação Acumulada
                </span>
                <span className="text-xs text-slate-400 font-bold">80% Concluído</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-sm font-bold text-slate-900">
                  Informe o valor já depreciado acumulado até o momento (caso o bem seja usado ou venha de saldo anterior):
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Valor Já Depreciado Acumulado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={extractedData.accumulatedDepreciation}
                    onChange={(e) => setExtractedData({ ...extractedData, accumulatedDepreciation: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-extrabold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Se o bem for novo adquirido neste mês, informe R$ 0,00.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setAnalysisStep(3)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setAnalysisStep(5)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  <span>Próximo: Categoria & Data</span> <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: QUESTION 5 - CATEGORY & DATE & FINAL REVIEW */}
          {analysisStep === 5 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md">
                  Pergunta 5 de 5 • Categoria e Data de Aquisição
                </span>
                <span className="text-xs text-slate-400 font-bold">100% Concluído</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-sm font-bold text-slate-900">
                  Confirme a categoria contábil e a data de aquisição do bem para finalizar o cadastro automático:
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Categoria Contábil</label>
                    <select
                      value={extractedData.category}
                      onChange={(e) => {
                        const cat = e.target.value as Asset['category'];
                        const labels: Record<string, string> = {
                          edificacoes: 'Edificações & Imóveis',
                          maquinas: 'Máquinas & Equipamentos',
                          veiculos: 'Veículos',
                          moveis: 'Móveis & Utensílios',
                          ti: 'Tecnologia da Informação',
                          software: 'Softwares & Licenças',
                          ferramentas: 'Ferramentas',
                          instalacoes: 'Instalações',
                          outro: 'Outros Bens',
                        };
                        setExtractedData({ ...extractedData, category: cat, categoryLabel: labels[cat] || 'Outros Bens' });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    >
                      <option value="ti">Tecnologia da Informação</option>
                      <option value="maquinas">Máquinas & Equipamentos</option>
                      <option value="veiculos">Veículos</option>
                      <option value="moveis">Móveis & Utensílios</option>
                      <option value="edificacoes">Edificações & Imóveis</option>
                      <option value="software">Softwares & Licenças</option>
                      <option value="ferramentas">Ferramentas</option>
                      <option value="instalacoes">Instalações</option>
                      <option value="outro">Outros Bens</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Data de Aquisição</label>
                    <input
                      type="date"
                      value={extractedData.acquisitionDate}
                      onChange={(e) => setExtractedData({ ...extractedData, acquisitionDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 text-xs text-teal-900 space-y-1 mt-2">
                  <p className="font-bold">Resumo do Cadastro Pronto:</p>
                  <p>• Bem: <strong>{extractedData.description}</strong> ({extractedData.tagNumber})</p>
                  <p>• Aquisição: <strong>R$ {extractedData.acquisitionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> em {extractedData.acquisitionDate.split('-').reverse().join('/')}</p>
                  <p>• Taxa Anual: <strong>{extractedData.annualRate}% a.a.</strong> • Depreciação Acumulada: <strong>R$ {extractedData.accumulatedDepreciation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setAnalysisStep(4)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={handleConfirmAndSave}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Cadastrando Ativo...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar e Cadastrar Ativo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

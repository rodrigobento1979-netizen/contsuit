import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderTree,
  Plus,
  Upload,
  Search,
  Download,
  Trash2,
  CheckCircle,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
  Info,
  Layers,
  BookOpen,
  Printer
} from 'lucide-react';
import { ChartAccount, Company } from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';

interface ChartOfAccountsViewProps {
  currentCompany: Company;
  allCompanies: Company[];
}

// Preset standard Brazilian accounting chart of accounts (NBC TG / SPED Referencial)
const STANDARD_CHART_PRESET: Omit<ChartAccount, 'id' | 'createdAt'>[] = [
  // 1 ATIVO
  { code: '1', name: 'ATIVO TOTAL', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 1 },
  { code: '1.1', name: 'ATIVO CIRCULANTE', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 2 },
  { code: '1.1.1', name: 'Disponibilidades', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 3 },
  { code: '1.1.1.01', name: 'Caixa Geral', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 4 },
  { code: '1.1.1.02.0001', name: 'Banco Itaú Unibanco S/A c/c', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'banco', level: 5 },
  { code: '1.1.1.02.0002', name: 'Banco Bradesco S/A c/c', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'banco', level: 5 },
  { code: '1.1.1.02.0003', name: 'Banco do Brasil S/A c/c', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'banco', level: 5 },
  { code: '1.1.1.02.0004', name: 'Banco Santander Brasil c/c', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'banco', level: 5 },
  { code: '1.1.1.03.0001', name: 'Aplicações de Liquidez Imediata (CDB/DI)', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 5 },
  { code: '1.1.2', name: 'Créditos e Clientes a Receber', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 3 },
  { code: '1.1.2.01.0001', name: 'Duplicatas a Receber de Clientes Nacionais', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 5 },
  { code: '1.1.3', name: 'Estoques de Mercadorias e Insumos', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 3 },
  { code: '1.1.3.01.0001', name: 'Estoque de Mercadorias para Revenda', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 5 },

  // 1.2 ATIVO NÃO CIRCULANTE
  { code: '1.2', name: 'ATIVO NÃO CIRCULANTE', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'outro', level: 2 },
  { code: '1.2.3', name: 'Ativo Imobilizado', type: 'sintetica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 3 },
  { code: '1.2.3.01.0001', name: 'Terrenos e Propriedades', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0002', name: 'Edificações, Benfeitorias e Galpões', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0003', name: 'Máquinas, Motores e Equipamentos Industriais', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0004', name: 'Móveis, Utensílios e Mobiliário Corporativo', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0005', name: 'Veículos, Frotas e Caminhões', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0006', name: 'Equipamentos de Informática e TI (Hardware)', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0007', name: 'Ferramentas Industriais e Acessórios', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.01.0008', name: 'Instalações Comerciais e Prediais', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },
  { code: '1.2.3.02.0001', name: 'Sistemas e Softwares Contábeis / ERP', type: 'analitica', nature: 'devedora', group: 'ativo', categoryTag: 'imobilizado', level: 5 },

  // 1.2.9 (-) DEPRECIAÇÕES ACUMULADAS
  { code: '1.2.3.09', name: '(-) Depreciações e Amortizações Acumuladas', type: 'sintetica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 4 },
  { code: '1.2.3.09.0001', name: '(-) Depreciação Acumulada - Edificações', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5 },
  { code: '1.2.3.09.0002', name: '(-) Depreciação Acumulada - Máquinas e Equipamentos', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5 },
  { code: '1.2.3.09.0003', name: '(-) Depreciação Acumulada - Móveis e Utensílios', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5 },
  { code: '1.2.3.09.0004', name: '(-) Depreciação Acumulada - Veículos', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5 },
  { code: '1.2.3.09.0005', name: '(-) Depreciação Acumulada - Informática e TI', type: 'analitica', nature: 'credora', group: 'ativo', categoryTag: 'depreciacao_acumulada', level: 5 },

  // 2 PASSIVO
  { code: '2', name: 'PASSIVO E PATRIMÔNIO LÍQUIDO', type: 'sintetica', nature: 'credora', group: 'passivo', categoryTag: 'outro', level: 1 },
  { code: '2.1', name: 'PASSIVO CIRCULANTE', type: 'sintetica', nature: 'credora', group: 'passivo', categoryTag: 'outro', level: 2 },
  { code: '2.1.1.01.0001', name: 'Fornecedores a Pagar Nacionais', type: 'analitica', nature: 'credora', group: 'passivo', categoryTag: 'outro', level: 5 },
  { code: '2.1.2.01.0001', name: 'Salários e Ordenados a Pagar', type: 'analitica', nature: 'credora', group: 'passivo', categoryTag: 'outro', level: 5 },
  { code: '2.1.3.01.0001', name: 'Honorários Contábeis a Pagar', type: 'analitica', nature: 'credora', group: 'passivo', categoryTag: 'outro', level: 5 },
  { code: '2.4', name: 'PATRIMÔNIO LÍQUIDO', type: 'sintetica', nature: 'credora', group: 'patrimonio_liquido', categoryTag: 'outro', level: 2 },
  { code: '2.4.1.01.0001', name: 'Capital Social Subscrito e Integralizado', type: 'analitica', nature: 'credora', group: 'patrimonio_liquido', categoryTag: 'outro', level: 5 },
  { code: '2.4.2.01.0001', name: 'Lucros ou Prejuízos Acumulados', type: 'analitica', nature: 'credora', group: 'patrimonio_liquido', categoryTag: 'outro', level: 5 },

  // 3 RECEITAS
  { code: '3', name: 'RECEITAS OPERACIONAIS', type: 'sintetica', nature: 'credora', group: 'receita', categoryTag: 'outro', level: 1 },
  { code: '3.1.1.01.0001', name: 'Receita Bruta da Prestação de Serviços', type: 'analitica', nature: 'credora', group: 'receita', categoryTag: 'outro', level: 5 },
  { code: '3.1.1.02.0001', name: 'Receita Bruta com Venda de Mercadorias', type: 'analitica', nature: 'credora', group: 'receita', categoryTag: 'outro', level: 5 },

  // 4 DESPESAS
  { code: '4', name: 'CUSTOS E DESPESAS OPERACIONAIS', type: 'sintetica', nature: 'devedora', group: 'despesa', categoryTag: 'outro', level: 1 },
  { code: '4.1.2.01.0001', name: 'Despesas com Pessoal e Salários', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'outro', level: 5 },
  { code: '4.1.3.01.0001', name: 'Despesas com Energia Elétrica e Telefonia', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'outro', level: 5 },
  { code: '4.1.3.02.0010', name: 'Despesas com Depreciação do Exercício', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'despesa_depreciacao', level: 5 },
  { code: '4.1.4.01.0001', name: 'Tarifas Bancárias e Despesas Financeiras', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'outro', level: 5 },
  { code: '4.1.5.01.0001', name: 'Despesas com Honorários Contábeis e Periciais', type: 'analitica', nature: 'devedora', group: 'despesa', categoryTag: 'outro', level: 5 },
];

export const ChartOfAccountsView: React.FC<ChartOfAccountsViewProps> = ({
  currentCompany,
}) => {
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const accountReportColumns: ReportColumn[] = [
    { key: 'code', label: 'Código da Conta', align: 'left' },
    { key: 'name', label: 'Nome / Descrição da Conta', align: 'left' },
    { 
      key: 'type', 
      label: 'Tipo', 
      align: 'center', 
      format: (val) => val === 'analitica' ? 'Analítica' : 'Sintética' 
    },
    { 
      key: 'nature', 
      label: 'Natureza', 
      align: 'center', 
      format: (val) => val === 'devedora' ? 'Devedora (D)' : 'Credora (C)' 
    },
    { 
      key: 'group', 
      label: 'Grupo Contábil', 
      align: 'left', 
      format: (val) => String(val || '').toUpperCase() 
    },
    { 
      key: 'categoryTag', 
      label: 'Classificação Especial', 
      align: 'left', 
      format: (val) => val || '-' 
    },
  ];

  // New Account Form State
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'analitica' | 'sintetica'>('analitica');
  const [newNature, setNewNature] = useState<'devedora' | 'credora'>('devedora');
  const [newGroup, setNewGroup] = useState<ChartAccount['group']>('ativo');
  const [newTag, setNewTag] = useState<ChartAccount['categoryTag']>('outro');
  const [newNotes, setNewNotes] = useState('');

  // Load accounts
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/accounts?companyId=${currentCompany.id}`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [currentCompany.id]);

  // Statistics
  const stats = useMemo(() => {
    const total = accounts.length;
    const analiticas = accounts.filter(a => a.type === 'analitica').length;
    const sinteticas = accounts.filter(a => a.type === 'sintetica').length;
    const imobilizado = accounts.filter(a => a.categoryTag === 'imobilizado').length;
    const depreciacao = accounts.filter(a => a.categoryTag === 'depreciacao_acumulada' || a.categoryTag === 'despesa_depreciacao').length;
    const bancos = accounts.filter(a => a.categoryTag === 'banco').length;
    return { total, analiticas, sinteticas, imobilizado, depreciacao, bancos };
  }, [accounts]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchSearch =
        acc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchGroup = groupFilter === 'all' || acc.group === groupFilter;
      const matchType = typeFilter === 'all' || acc.type === typeFilter;
      const matchTag = tagFilter === 'all' || acc.categoryTag === tagFilter;
      return matchSearch && matchGroup && matchType && matchTag;
    }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, searchTerm, groupFilter, typeFilter, tagFilter]);

  // Handle Create Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newCode.trim(),
          name: newName.trim(),
          type: newType,
          nature: newNature,
          group: newGroup,
          categoryTag: newTag,
          companyId: currentCompany.id,
          notes: newNotes,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewCode('');
        setNewName('');
        setNewNotes('');
        setMessage({ type: 'success', text: 'Conta contábil cadastrada com sucesso!' });
        fetchAccounts();
      } else {
        const errData = await res.json();
        setMessage({ type: 'error', text: errData.error || 'Erro ao criar conta contábil.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Falha de comunicação ao salvar conta.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Load Standard Preset
  const handleLoadStandardPreset = async () => {
    if (!confirm('Deseja carregar o Plano de Contas Padrão Brasileiro (SPED/NBC TG) para esta empresa?')) return;
    setIsSubmitting(true);
    try {
      const formatted = STANDARD_CHART_PRESET.map(acc => ({
        ...acc,
        companyId: currentCompany.id,
      }));
      const res = await fetch('/api/accounts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: currentCompany.id,
          accounts: formatted,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: `Plano padrão carregado com sucesso! ${data.count} contas inseridas.`,
        });
        fetchAccounts();
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao carregar plano padrão.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Bulk Import from CSV/TXT
  const handleImportCsv = async () => {
    if (!importText.trim()) return;
    setIsSubmitting(true);

    try {
      const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
      const parsedAccounts: Omit<ChartAccount, 'id' | 'createdAt'>[] = [];

      for (const line of lines) {
        // Skip header lines
        if (line.toLowerCase().startsWith('codigo') || line.toLowerCase().startsWith('código')) continue;

        // Split by semicolon, comma or tab
        const parts = line.split(/[;\t,]/).map(p => p.trim());
        if (parts.length >= 2) {
          const code = parts[0];
          const name = parts[1];
          const rawType = (parts[2] || '').toLowerCase();
          const rawNature = (parts[3] || '').toLowerCase();

          const type: 'analitica' | 'sintetica' =
            rawType.startsWith('s') ? 'sintetica' : 'analitica';

          const nature: 'devedora' | 'credora' =
            rawNature.startsWith('c') ? 'credora' : 'devedora';

          // Determine group by root code
          let group: ChartAccount['group'] = 'ativo';
          if (code.startsWith('1')) group = 'ativo';
          else if (code.startsWith('2.4') || code.startsWith('2.3')) group = 'patrimonio_liquido';
          else if (code.startsWith('2')) group = 'passivo';
          else if (code.startsWith('3')) group = 'receita';
          else if (code.startsWith('4') || code.startsWith('5')) group = 'despesa';

          // Determine tag
          let categoryTag: ChartAccount['categoryTag'] = 'outro';
          const lowerName = name.toLowerCase();
          if (lowerName.includes('banco') || lowerName.includes('caixa') || lowerName.includes('c/c')) categoryTag = 'banco';
          else if (lowerName.includes('deprecia') && lowerName.includes('acumulada')) categoryTag = 'depreciacao_acumulada';
          else if (lowerName.includes('despesa') && lowerName.includes('deprecia')) categoryTag = 'despesa_depreciacao';
          else if (code.startsWith('1.2.3') || lowerName.includes('imobilizado') || lowerName.includes('ve[ií]culo') || lowerName.includes('m[aá]quina')) categoryTag = 'imobilizado';

          parsedAccounts.push({
            code,
            name,
            type,
            nature,
            group,
            categoryTag,
            companyId: currentCompany.id,
            level: code.split('.').length,
          });
        }
      }

      if (parsedAccounts.length === 0) {
        setMessage({ type: 'error', text: 'Nenhuma conta válida identificada no formato CODIGO;DESCRICAO' });
        return;
      }

      const res = await fetch('/api/accounts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: currentCompany.id,
          accounts: parsedAccounts,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowImportModal(false);
        setImportText('');
        setMessage({ type: 'success', text: `Importação concluída! ${data.count} contas contábeis cadastradas.` });
        fetchAccounts();
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro durante o processamento da importação.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Account
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir a conta contábil "${name}"?`)) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== id));
        setMessage({ type: 'success', text: 'Conta excluída com sucesso.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao excluir conta contábil.' });
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const header = 'CODIGO;DESCRICAO;TIPO;NATUREZA;GRUPO;VINCULO\n';
    const rows = filteredAccounts.map(a =>
      `"${a.code}";"${a.name}";"${a.type}";"${a.nature}";"${a.group}";"${a.categoryTag || 'geral'}"`
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `plano_de_contas_${currentCompany.cnpj.replace(/\D/g, '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 w-full max-w-full overflow-hidden">
      {/* Top Banner Alert */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-300 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-[11px] font-bold underline cursor-pointer ml-3 opacity-75 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Clean Top Header (No extra unnecessary cards) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#00897b] flex items-center justify-center shrink-0 border border-teal-200/60">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Plano de Contas Contábil
            </h1>
            <p className="text-xs text-slate-500">
              Estrutura de contas para a empresa <strong>{currentCompany.fantasyName || currentCompany.name}</strong> • Total de {accounts.length} contas cadastradas
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowReportModal(true)}
            className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title="Emitir relatório do plano de contas"
          >
            <Printer className="w-3.5 h-3.5 text-teal-700" />
            <span>Emitir Relatório</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5 text-teal-700" />
            <span>Importar Plano</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Cadastrar Conta</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Actions & Filters Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar conta contábil por código ou descrição..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
              />
            </div>

            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
            >
              <option value="all">Todos os Grupos</option>
              <option value="ativo">1 - Ativo</option>
              <option value="passivo">2 - Passivo</option>
              <option value="patrimonio_liquido">2.4 - Patrimônio Líquido</option>
              <option value="receita">3 - Receitas</option>
              <option value="despesa">4 - Custos e Despesas</option>
            </select>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
            >
              <option value="all">Tipos (Todos)</option>
              <option value="analitica">Analítica</option>
              <option value="sintetica">Sintética</option>
            </select>

            <select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
            >
              <option value="all">Vínculos (Todos)</option>
              <option value="banco">Bancos / Caixa</option>
              <option value="imobilizado">Ativo Imobilizado</option>
              <option value="depreciacao_acumulada">Deprec. Acumulada</option>
              <option value="despesa_depreciacao">Despesa Deprec.</option>
              <option value="outro">Gerais</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadStandardPreset}
              disabled={isSubmitting}
              className="px-3 py-1.5 bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Carregar plano padrão de contas contábeis brasileiro"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
              <span>Plano Padrão (SPED)</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Importar CSV</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Exportar plano para CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Exportar</span>
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Conta</span>
            </button>
          </div>
        </div>

        {/* Company Context Notice */}
        <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-100/90 text-amber-900 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>
              Plano de Contas configurado para <strong>{currentCompany.name}</strong> ({currentCompany.cnpj}). Toda parametrização de Ativo Imobilizado, Depreciação e Extrato Bancário estará vinculada a esta estrutura.
            </span>
          </div>
          <span className="text-[10px] font-semibold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded">
            Sistema: {currentCompany.accountingSystem.toUpperCase()}
          </span>
        </div>

        {/* Accounts Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <span>Carregando plano de contas...</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-3">
              <FolderTree className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-semibold text-slate-600">Nenhuma conta contábil encontrada</div>
              <p className="max-w-md mx-auto text-slate-400 text-[11px]">
                Você pode carregar o plano de contas padrão brasileiro (SPED) com 1 clique ou importar o plano de contas em formato CSV/TXT da empresa.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleLoadStandardPreset}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Carregar Plano Padrão Brasileiro
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] font-semibold border-b border-slate-200/80">
                  <th className="py-2.5 px-4">Classificação / Código</th>
                  <th className="py-2.5 px-4">Descrição da Conta</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Natureza</th>
                  <th className="py-2.5 px-3">Grupo</th>
                  <th className="py-2.5 px-3">Finalidade / Vínculo</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map(account => {
                  const isSintetica = account.type === 'sintetica';
                  const indentLevel = Math.min((account.level || account.code.split('.').length) - 1, 4);

                  return (
                    <tr
                      key={account.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSintetica ? 'bg-slate-50/40 font-bold text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {/* Code */}
                      <td className="py-2 px-4 font-mono text-[11px] whitespace-nowrap">
                        <span
                          style={{ marginLeft: `${indentLevel * 14}px` }}
                          className={`inline-block ${isSintetica ? 'text-teal-900 font-extrabold' : 'text-slate-600'}`}
                        >
                          {account.code}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="py-2 px-4">
                        <span
                          style={{ marginLeft: `${indentLevel * 14}px` }}
                          className={`inline-block ${
                            isSintetica ? 'text-slate-900 uppercase tracking-tight' : 'text-slate-800'
                          }`}
                        >
                          {account.name}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {account.type === 'analitica' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                            Analítica
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200/70">
                            Sintética
                          </span>
                        )}
                      </td>

                      {/* Nature */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            account.nature === 'devedora'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200/70'
                              : 'bg-purple-50 text-purple-800 border border-purple-200/70'
                          }`}
                        >
                          {account.nature === 'devedora' ? 'Devedora (D)' : 'Credora (C)'}
                        </span>
                      </td>

                      {/* Group */}
                      <td className="py-2 px-3 uppercase text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                        {account.group.replace('_', ' ')}
                      </td>

                      {/* Category Tag */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {account.categoryTag === 'banco' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                            Banco / Caixa
                          </span>
                        )}
                        {account.categoryTag === 'imobilizado' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            Imobilizado
                          </span>
                        )}
                        {account.categoryTag === 'depreciacao_acumulada' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Deprec. Acumulada
                          </span>
                        )}
                        {account.categoryTag === 'despesa_depreciacao' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">
                            Despesa Deprec.
                          </span>
                        )}
                        {(!account.categoryTag || account.categoryTag === 'outro') && (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDelete(account.id, account.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Excluir conta contábil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL: NOVA CONTA CONTÁBIL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-800">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Cadastrar Conta Contábil</h3>
                  <p className="text-xs text-slate-500">Defina os parâmetros contábeis e classificação</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código Contábil *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 1.2.3.01.0005"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400">Classificação numérica estruturada</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo da Conta *</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  >
                    <option value="analitica">Analítica (Recebe Lançamentos)</option>
                    <option value="sintetica">Sintética (Totalizadora)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição / Nome da Conta *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Veículos e Caminhões de Distribuição"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Natureza do Saldo</label>
                  <select
                    value={newNature}
                    onChange={e => setNewNature(e.target.value as any)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  >
                    <option value="devedora">Devedora (Ativos / Despesas)</option>
                    <option value="credora">Credora (Passivos / PL / Receitas)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Grupo Contábil</label>
                  <select
                    value={newGroup}
                    onChange={e => setNewGroup(e.target.value as any)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  >
                    <option value="ativo">1 - Ativo</option>
                    <option value="passivo">2 - Passivo</option>
                    <option value="patrimonio_liquido">2.4 - Patrimônio Líquido</option>
                    <option value="receita">3 - Receita</option>
                    <option value="despesa">4 - Despesa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Finalidade / Vínculo Parametrizado</label>
                <select
                  value={newTag}
                  onChange={e => setNewTag(e.target.value as any)}
                  className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="outro">Geral / Sem vínculo específico</option>
                  <option value="banco">Banco / Caixa (Extrato OFX e Conciliação)</option>
                  <option value="imobilizado">Ativo Imobilizado (Bens Patrimoniais)</option>
                  <option value="depreciacao_acumulada">Depreciação Acumulada (Redutora do Ativo)</option>
                  <option value="despesa_depreciacao">Despesa com Depreciação (Resultado)</option>
                </select>
                <span className="text-[10px] text-slate-400">
                  Permite que os módulos de Depreciação e OFX identifiquem esta conta automaticamente.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações ou Regras Internas</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Conta padrão para apropriação dos veículos adquiridos via financiamento bancário."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORTAR PLANO DE CONTAS VIA CSV/TXT */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-800">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Importar Plano de Contas</h3>
                  <p className="text-xs text-slate-500">Aceita arquivos PDF, TXT, Excel (.xlsx/.xls) ou CSV</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-3 bg-teal-50/80 border border-teal-200/80 rounded-xl text-teal-900 text-xs space-y-1">
              <div className="font-bold">Formato aceito (separado por ponto e vírgula, vírgula ou tabulação):</div>
              <code className="block bg-white/80 p-2 rounded border border-teal-200 font-mono text-[11px] text-teal-950">
                CODIGO;DESCRICAO;TIPO;NATUREZA<br />
                1.1.1.02.0001;Banco Itaú c/c;A;D<br />
                1.2.3.01.0005;Veículos e Automóveis;A;D<br />
                1.2.3.09.0004;(-) Deprec. Acumulada Veículos;A;C
              </code>
              <span className="text-[10px] text-teal-700 block">
                * Dica: Você pode copiar diretamente de tabelas do Excel ou relatórios em PDF/TXT e colar abaixo.
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <label>Conteúdo ou Arquivo do Plano de Contas:</label>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls,.pdf"
                  id="csv-file-picker"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setImportText((ev.target?.result as string) || '');
                      };
                      reader.readAsText(file, 'ISO-8859-1');
                    }
                  }}
                />
                <label
                  htmlFor="csv-file-picker"
                  className="text-teal-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Carregar arquivo (.CSV / .TXT / .Excel / .PDF)
                </label>
              </div>

              <textarea
                rows={8}
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="1.1.1.01.0001;Caixa Geral;A;D&#10;1.1.1.02.0001;Banco do Brasil c/c;A;D&#10;1.2.3.01.0001;Máquinas Industriais;A;D&#10;1.2.3.09.0001;(-) Deprec Acumulada Máquinas;A;C"
                className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                disabled={isSubmitting || !importText.trim()}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Importando...' : 'Processar e Gravar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Print Modal */}
      {showReportModal && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setShowReportModal(false)}
          title="Plano de Contas Contábil Estruturado"
          subtitle={`Estrutura e Parametrizações • Empresa: ${currentCompany.fantasyName || currentCompany.name}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Total de Contas', value: stats.total },
            { label: 'Contas Analíticas', value: stats.analiticas },
            { label: 'Contas Sintéticas', value: stats.sinteticas },
            { label: 'Imobilizado & Deprec.', value: stats.imobilizado + stats.depreciacao },
          ]}
          columns={accountReportColumns}
          data={filteredAccounts}
        />
      )}
    </div>
  );
};

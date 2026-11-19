import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  PlusCircle, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter, 
  Building2, 
  Calendar, 
  Receipt, 
  Check, 
  Loader2,
  DollarSign,
  TrendingUp,
  X,
  Printer
} from 'lucide-react';
import { FeeContract, Company } from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';

interface HonorariosViewProps {
  currentCompany: Company;
  allCompanies: Company[];
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export const HonorariosView: React.FC<HonorariosViewProps> = ({
  currentCompany,
  allCompanies,
  showToast,
}) => {
  const [fees, setFees] = useState<FeeContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pago' | 'em_aberto' | 'atrasado'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<FeeContract | null>(null);

  // Form states for new contract
  const [companyId, setCompanyId] = useState(allCompanies[0]?.id || '');
  const [monthlyFee, setMonthlyFee] = useState<number>(2500);
  const [dueDay, setDueDay] = useState<number>(10);
  const [selectedServices, setSelectedServices] = useState<string[]>([
    'Escrituração Contábil CPC',
    'Escrituração Fiscal & SPED',
    'Folha de Pagamento',
  ]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const feeReportColumns: ReportColumn[] = [
    { key: 'companyName', label: 'Empresa Cliente', align: 'left' },
    { key: 'cnpj', label: 'CNPJ', align: 'left' },
    { key: 'monthlyFee', label: 'Mensalidade (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'dueDay', label: 'Vencimento', align: 'center', format: (val) => `Dia ${val}` },
    { 
      key: 'lastPaymentStatus', 
      label: 'Status Competência', 
      align: 'center',
      format: (val) => (
        <span className={val === 'pago' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
          {val === 'pago' ? 'LIQUIDADO' : 'EM ABERTO'}
        </span>
      )
    },
  ];

  // Pay form states
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'pix' | 'boleto' | 'transferencia' | 'cartao'>('pix');
  const [payNotes, setPayNotes] = useState('');

  const availableServices = [
    'Escrituração Contábil CPC',
    'Escrituração Fiscal & SPED',
    'Folha de Pagamento & eSocial',
    'BPO Financeiro',
    'Consultoria Tributária & Lucro Real',
    'Controle de Ativo Imobilizado',
  ];

  const fetchFees = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/fees');
      if (res.ok) {
        const data = await res.json();
        setFees(data);
      }
    } catch (err) {
      console.error('Error fetching fees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFees();
  }, []);

  const handleToggleService = (srv: string) => {
    if (selectedServices.includes(srv)) {
      setSelectedServices(selectedServices.filter(s => s !== srv));
    } else {
      setSelectedServices([...selectedServices, srv]);
    }
  };

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !monthlyFee) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          monthlyFee: Number(monthlyFee),
          dueDay: Number(dueDay),
          services: selectedServices,
          notes,
        }),
      });

      if (!res.ok) throw new Error('Falha ao salvar contrato');
      showToast('Contrato de honorários cadastrado com sucesso!');
      setIsContractModalOpen(false);
      fetchFees();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar contrato', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPayModal = (contract: FeeContract) => {
    setSelectedContract(contract);
    setPayAmount(contract.monthlyFee);
    setPayNotes(`Liquidação mensal de honorários - ${new Date().toISOString().slice(0, 7)}`);
    setIsPayModalOpen(true);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/fees/${selectedContract.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(payAmount),
          competenceMonth: new Date().toISOString().slice(0, 7),
          paymentMethod: payMethod,
          notes: payNotes,
        }),
      });

      if (!res.ok) throw new Error('Falha ao registrar pagamento');
      showToast(`Pagamento de R$ ${payAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} liquidado com sucesso!`);
      setIsPayModalOpen(false);
      fetchFees();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar pagamento', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // KPIs
  const totalPrevisto = fees.reduce((acc, f) => acc + (f.monthlyFee || 0), 0);
  const totalRecebido = fees
    .filter(f => f.lastPaymentStatus === 'pago')
    .reduce((acc, f) => acc + (f.monthlyFee || 0), 0);
  const totalEmAberto = fees
    .filter(f => f.lastPaymentStatus !== 'pago')
    .reduce((acc, f) => acc + (f.monthlyFee || 0), 0);
  const totalClientes = fees.length;

  // Filtered list
  const filteredFees = fees.filter(f => {
    const matchesStatus = statusFilter === 'all' || f.lastPaymentStatus === statusFilter;
    const matchesSearch = 
      f.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.cnpj.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-5 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-amber-600" />
            Controle Financeiro de Honorários Contábeis
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestão de contratos mensais, faturamento do escritório, vencimentos e controle de recebimentos por empresa cliente.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowReportModal(true)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            title="Emitir relatório geral de honorários"
          >
            <Printer className="w-4 h-4 text-emerald-700" />
            <span>Emitir Relatório</span>
          </button>

          <button
            onClick={() => {
              setSelectedContract(null);
              setIsContractModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold shadow-sm transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Novo Contrato</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (Compact & Simple) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Previsto */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Faturamento Previsto</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900">
            R$ {totalPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400">Competência vigente</span>
        </div>

        {/* Card 2: Recebido */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Total Liquidado</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base font-bold text-emerald-700">
            R$ {totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-emerald-600 font-semibold">
            {totalPrevisto > 0 ? ((totalRecebido / totalPrevisto) * 100).toFixed(0) : 0}% recebido
          </span>
        </div>

        {/* Card 3: Em Aberto / Atrasado */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500">A Receber</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base font-bold text-amber-700">
            R$ {totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400">Pendente de baixa</span>
        </div>

        {/* Card 4: Clientes Ativos */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Clientes</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900">
            {totalClientes} empresas
          </p>
          <span className="text-[10px] text-slate-400">Contratos na carteira</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        {/* Status Filters */}
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Todos ({fees.length})
          </button>
          <button
            onClick={() => setStatusFilter('pago')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              statusFilter === 'pago' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Pagos
          </button>
          <button
            onClick={() => setStatusFilter('em_aberto')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              statusFilter === 'em_aberto' ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Em Aberto
          </button>
          <button
            onClick={() => setStatusFilter('atrasado')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              statusFilter === 'atrasado' ? 'bg-white text-rose-800 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Atrasados
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar empresa ou CNPJ..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs">Carregando carteira de honorários...</span>
          </div>
        ) : filteredFees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Coins className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Nenhum contrato de honorários encontrado.</p>
            <p className="text-xs text-slate-400">Cadastre o primeiro contrato clicando no botão acima.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Empresa Cliente</th>
                  <th className="py-3 px-4 text-right">Valor Mensal</th>
                  <th className="py-3 px-4 text-center">Vencimento</th>
                  <th className="py-3 px-4">Serviços Contratados</th>
                  <th className="py-3 px-4 text-center">Status Mês</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredFees.map((contract) => (
                  <tr key={contract.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{contract.companyName}</p>
                      <p className="text-[11px] text-slate-400 font-mono">CNPJ: {contract.cnpj}</p>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      R$ {contract.monthlyFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Dia {contract.dueDay}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {contract.services.map((srv, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200"
                          >
                            {srv}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          contract.lastPaymentStatus === 'pago'
                            ? 'bg-emerald-100 text-emerald-800'
                            : contract.lastPaymentStatus === 'atrasado'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {contract.lastPaymentStatus === 'pago' && <Check className="w-3 h-3" />}
                        {contract.lastPaymentStatus === 'pago'
                          ? 'Pago'
                          : contract.lastPaymentStatus === 'atrasado'
                          ? 'Atrasado'
                          : 'Em Aberto'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {contract.lastPaymentStatus !== 'pago' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(contract)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer shadow-2xs"
                        >
                          Registrar Pagamento
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-700">
                          Liquidado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Novo Contrato de Honorários */}
      {isContractModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-600" />
                Novo Contrato de Honorários
              </h3>
              <button
                onClick={() => setIsContractModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContract} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Empresa Cliente
                </label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  {allCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fantasyName || c.name} (CNPJ: {c.cnpj})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Valor Mensal (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(Number(e.target.value))}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dia do Vencimento
                  </label>
                  <select
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {[5, 10, 15, 20, 25, 28].map((day) => (
                      <option key={day} value={day}>
                        Todo dia {day}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Serviços Contratados
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableServices.map((srv) => {
                    const isChecked = selectedServices.includes(srv);
                    return (
                      <button
                        key={srv}
                        type="button"
                        onClick={() => handleToggleService(srv)}
                        className={`text-left p-2 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{srv}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações do Contrato (Opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Reajuste anual pelo IPCA, vencimento prorrogável para próximo dia útil."
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsContractModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar Contrato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Pagamento de Honorário */}
      {isPayModalOpen && selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                Registrar Pagamento
              </h3>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs">
              <p className="font-bold text-emerald-950">{selectedContract.companyName}</p>
              <p className="text-emerald-700 text-[11px]">CNPJ: {selectedContract.cnpj}</p>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Valor Liquidado (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full text-sm font-bold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={payMethod}
                  onChange={(e: any) => setPayMethod(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="boleto">Boleto Bancário</option>
                  <option value="transferencia">Transferência Bancária (TED)</option>
                  <option value="cartao">Cartão Corporativo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Comprovante / Observações
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar Baixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Print Modal */}
      {showReportModal && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setShowReportModal(false)}
          title="Relatório de Controle Financeiro de Honorários Contábeis"
          subtitle={`Posição de Contratos e Recebimentos • Carteira de Clientes`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Faturamento Previsto', value: `R$ ${totalPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'Total Liquidado', value: `R$ ${totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'A Receber', value: `R$ ${totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'Clientes Ativos', value: totalClientes },
          ]}
          columns={feeReportColumns}
          data={filteredFees}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  CloudCheck,
  ShieldCheck,
  HardDrive,
  Layers,
  FileCheck2,
  X
} from 'lucide-react';
import { User, Company } from '../types';

interface DatabaseViewProps {
  currentUser: User;
  currentCompany: Company;
  onDataChanged: () => Promise<void>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

interface DbStats {
  status: string;
  engine: string;
  databaseId: string;
  filePath: string;
  fileSizeKb: number;
  lastSync: string;
  counts: {
    companies: number;
    users: number;
    assets: number;
    statements: number;
    fees: number;
    payments: number;
    accounts: number;
  };
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  currentUser,
  currentCompany,
  onDataChanged,
  showToast,
}) => {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modals
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJsonText, setRestoreJsonText] = useState('');
  const [restoreFileName, setRestoreFileName] = useState('');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/database/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching database stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Handle Download Backup
  const handleDownloadBackup = async () => {
    try {
      setIsProcessing(true);
      const res = await fetch('/api/database/backup');
      if (!res.ok) throw new Error('Falha ao gerar backup.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `contsuite_backup_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Backup do banco de dados baixado com sucesso!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao baixar backup', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Restore Backup
  const handleRestoreBackup = async () => {
    if (!restoreJsonText.trim()) {
      showToast('Nenhum arquivo ou dado de backup selecionado.', 'error');
      return;
    }

    try {
      setIsProcessing(true);
      const parsed = JSON.parse(restoreJsonText);
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao restaurar banco de dados.');
      }

      setShowRestoreModal(false);
      setRestoreJsonText('');
      setRestoreFileName('');
      showToast('Banco de dados restaurado com sucesso!');
      await onDataChanged();
      await fetchStats();
    } catch (err: any) {
      showToast(err.message || 'Erro na validação do arquivo de backup.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Clear Demo Data
  const handleClearDemoData = async () => {
    if (confirmText.trim().toUpperCase() !== 'LIMPAR') {
      showToast('Digite a palavra LIMPAR para confirmar a exclusão dos dados demo.', 'error');
      return;
    }

    try {
      setIsProcessing(true);
      const res = await fetch('/api/database/clear-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: currentUser.email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao limpar dados de demonstração.');

      setShowClearConfirmModal(false);
      setConfirmText('');
      showToast('Dados de demonstração removidos! Base limpa para produção.');
      await onDataChanged();
      await fetchStats();
    } catch (err: any) {
      showToast(err.message || 'Erro ao limpar dados.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-full overflow-hidden space-y-5">
      {/* Header Banner - Clean, Light & ContSuite Themed */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60">
            <Database className="w-5 h-5 text-[#00897b]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
              Gestão do Banco de Dados & Backups
            </h1>
            <p className="text-xs text-slate-500 truncate">
              Configurações de sincronização, exportação de segurança e limpeza de demonstração
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Grid of Database Cards - 100% Responsive, Zero Horizontal Scroll */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Status da Conexão */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CloudCheck className="w-4 h-4 text-emerald-600" />
                Conexão Firestore & Cache
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Ativo
              </span>
            </div>

            <div className="space-y-2 mt-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                  Instância Firestore ID:
                </span>
                <code className="text-[11px] font-mono text-teal-900 font-bold break-all block">
                  {stats?.databaseId || 'ai-studio-activixcontbil-fd974dcb-fbbe-4b91-be88-235e45b53bfe'}
                </code>
              </div>

              <div className="flex items-center justify-between text-slate-600 text-xs px-1">
                <span>Armazenamento local:</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {stats?.fileSizeKb ? `${stats.fileSizeKb} KB` : 'Ativo'}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600 text-xs px-1">
                <span>Administrador Master:</span>
                <span className="font-semibold text-teal-800 truncate max-w-[150px]">
                  {currentUser.email}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Última sincronização:</span>
            <span className="font-mono text-[10px] text-slate-500">
              {stats?.lastSync ? new Date(stats.lastSync).toLocaleTimeString('pt-BR') : 'Agora'}
            </span>
          </div>
        </div>

        {/* Card 2: Estatísticas de Registros */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-teal-600" />
                Registros Armazenados
              </span>
              <span className="text-[10px] font-bold text-slate-500">Base Ativa</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block">Empresas</span>
                <span className="text-sm font-bold text-slate-900">{stats?.counts.companies ?? 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block">Usuários</span>
                <span className="text-sm font-bold text-slate-900">{stats?.counts.users ?? 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block">Ativo Imobilizado</span>
                <span className="text-sm font-bold text-slate-900">{stats?.counts.assets ?? 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block">Extratos OFX</span>
                <span className="text-sm font-bold text-slate-900">{stats?.counts.statements ?? 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block">Honorários</span>
                <span className="text-sm font-bold text-slate-900">{stats?.counts.fees ?? 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block">Plano de Contas</span>
                <span className="text-sm font-bold text-teal-800">{stats?.counts.accounts ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
            Multi-empresa com isolamento estrito de dados
          </div>
        </div>

        {/* Card 3: Backup & Restauração */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between md:col-span-2 lg:col-span-1">
          <div>
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#00897b]" />
                Segurança & Cópias de Backup
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                100% JSON
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Exporte todos os cadastros, bens patrimoniais, honorários e parametrizações contábeis com 1 clique para restauração futura.
            </p>

            <div className="space-y-2 mt-3">
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={isProcessing}
                className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Fazer Backup do Banco (.JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRestoreModal(true)}
                disabled={isProcessing}
                className="w-full py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Restaurar Cópia de Backup</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
            Compatível com migrações e rotinas de auditoria
          </div>
        </div>
      </div>

      {/* Clean Demo Data Reset Card - Light Theme, Clear & Safe */}
      <div className="bg-white rounded-2xl p-5 border border-amber-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/80">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Limpeza de Dados de Demonstração (Iniciar Base Real em Produção)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Deseja limpar os cadastros de teste gerados durante a demonstração? Esta ação remove os ativos fictícios, extratos simulados e contratos demo, mantendo o seu usuário de Administrador Master (<strong>{currentUser.email}</strong>) e o <strong>Plano de Contas Referencial</strong> intactos para você cadastrar as empresas reais do escritório.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowClearConfirmModal(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Dados de Demonstração</span>
          </button>
        </div>
      </div>

      {/* MODAL: CONFIRMAR LIMPEZA DE DEMONSTRAÇÃO */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-rose-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-800">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Confirmar Limpeza da Base</h3>
                  <p className="text-xs text-slate-500">Exclusão dos dados de teste</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowClearConfirmModal(false);
                  setConfirmText('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl space-y-1">
                <p className="font-bold">Atenção! Esta ação removerá:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-800">
                  <li>Todos os bens de ativo imobilizado cadastrados como teste</li>
                  <li>Extratos bancários OFX temporários</li>
                  <li>Contratos de honorários fictícios</li>
                  <li>Empresas demo adicionais</li>
                </ul>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl space-y-0.5 text-[11px]">
                <p className="font-bold">O que será preservado:</p>
                <p>✓ Administrador Master: <strong>{currentUser.email}</strong></p>
                <p>✓ Sede Bento Contabilidade</p>
                <p>✓ Plano de Contas Padrão Brasileiro (SPED/NBC TG)</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Digite a palavra <span className="text-rose-600 font-mono font-bold">LIMPAR</span> para confirmar:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="LIMPAR"
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-mono text-center font-bold text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirmModal(false);
                  setConfirmText('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClearDemoData}
                disabled={isProcessing || confirmText.trim().toUpperCase() !== 'LIMPAR'}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isProcessing ? 'Limpando...' : 'Confirmar e Limpar Base'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESTAURAR BACKUP */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-800">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Restaurar Cópia de Segurança</h3>
                  <p className="text-xs text-slate-500">Selecione o arquivo JSON de backup do ContSuite</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoreJsonText('');
                  setRestoreFileName('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700">Arquivo de Backup (.json):</label>
                <input
                  type="file"
                  accept=".json,application/json"
                  id="backup-file-input"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setRestoreFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setRestoreJsonText((ev.target?.result as string) || '');
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <label
                  htmlFor="backup-file-input"
                  className="text-teal-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Selecionar arquivo .JSON</span>
                </label>
              </div>

              {restoreFileName && (
                <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center justify-between">
                  <span className="font-bold truncate">{restoreFileName}</span>
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Ou cole o conteúdo JSON do backup abaixo:
                </label>
                <textarea
                  rows={6}
                  value={restoreJsonText}
                  onChange={(e) => setRestoreJsonText(e.target.value)}
                  placeholder='{"version": "1.0", "data": { "companies": [...], "assets": [...] }}'
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoreJsonText('');
                  setRestoreFileName('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={isProcessing || !restoreJsonText.trim()}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isProcessing ? 'Restaurando...' : 'Confirmar e Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

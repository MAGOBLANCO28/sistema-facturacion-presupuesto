import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  Receipt,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  Zap,
  Clock,
  Wallet,
  FileText,
  Activity,
  BarChart3,
  Radio,
} from 'lucide-react';
import Card from './common/Card';

interface ReportData {
  totalIncome: number;
  totalIncomeBase: number;
  totalExpense: number;
  expenseBase: number;
  ivaRepercutido: number;
  ivaSoportado: number;
  ivaNeto: number;
  ivaToPay: number;
  irpfRetenido: number;
  realSalary: number;
  netProfit: number;
  isAutonomo: boolean;
}

const formatEuro = (amount: number | undefined) => {
  if (typeof amount !== 'number') return '0,00 €';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
};

const formatDate = (dateString: string) => {
  if (!dateString) return '—';
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(dateString));
  } catch { return dateString; }
};

const STATUS_COLORS: Record<string, string> = {
  'Pagada':        'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'Emitida':       'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'Borrador':      'bg-white/10 text-slate-400 border-white/10',
  'Pendiente':     'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Convertido':    'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'Rectificativa': 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  'Aceptado':      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'Rechazado':     'bg-rose-500/15 text-rose-400 border-rose-500/20',
};

export default function DashboardView() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingCollection, setPendingCollection] = useState(0);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [taxDeadlines, setTaxDeadlines] = useState<any[]>([]);

  useEffect(() => {
    fetchReport();
    fetchDocuments();
    fetchTaxDeadlines();
  }, []);

  const fetchReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reports/real-income', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setReport(data);
    } catch {}
    finally { setLoading(false); }
  };

  const fetchTaxDeadlines = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/tax-deadlines', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setTaxDeadlines(await res.json());
    } catch {}
  };

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const docs = await res.json();
      if (!Array.isArray(docs)) return;
      // Solo facturas Emitidas (sin pagar, sin cancelar) → pendiente de cobro real
      const pending = docs
        .filter((d: any) => d.type === 'invoice' && d.status === 'Emitida')
        .reduce((acc: number, d: any) => acc + (d.total || 0), 0);
      setPendingCollection(pending);
      setRecentDocs(docs.slice(0, 6));
    } catch {}
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <RefreshCw className="animate-spin text-purple-500" size={32} />
      <p className="text-slate-500 font-black animate-pulse uppercase tracking-[0.4em] text-[10px]">Sincronizando...</p>
    </div>
  );

  const dr = report || { totalIncome: 0, totalIncomeBase: 0, totalExpense: 0, expenseBase: 0, ivaRepercutido: 0, ivaSoportado: 0, ivaNeto: 0, ivaToPay: 0, irpfRetenido: 0, realSalary: 0, netProfit: 0, isAutonomo: true };
  const marginPct = dr.totalIncome > 0 ? Math.round((dr.netProfit / dr.totalIncome) * 100) : 0;
  const alerts: string[] = [];
  if (dr.ivaToPay > 3000) alerts.push('Alerta Fiscal: Reserva de IVA elevada (>3.000€).');
  if (dr.totalExpense < dr.totalIncome * 0.1 && dr.totalIncome > 0) alerts.push('Sugerencia: Revisa tus gastos deducibles.');

  return (
    <div className="space-y-4 pb-8 max-w-5xl mx-auto">

      {/* KPI Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 relative overflow-hidden flex flex-col justify-between" accent="purple">
          <div className="absolute top-0 right-0 p-8 opacity-[0.04] -rotate-12 scale-150 pointer-events-none text-purple-300">
            <TrendingUp size={140} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
                  <Zap size={12} className="text-purple-400" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Liquidez Real Disponible</p>
              </div>
              <button
                onClick={() => setHideAmounts(!hideAmounts)}
                className="text-[9px] font-black text-slate-600 hover:text-slate-300 uppercase tracking-widest transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
              >
                {hideAmounts ? 'MOSTRAR' : 'OCULTAR'}
              </button>
            </div>
            <h3 className="text-5xl font-black tracking-tighter tabular-nums text-white leading-none">
              {hideAmounts ? '••••••' : formatEuro(dr.realSalary)}
            </h3>
          </div>
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/5">
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <ArrowUpRight size={10} className="text-emerald-400" /> Ingresos
              </p>
              <p className="text-sm font-bold text-white tabular-nums">{hideAmounts ? '•••' : formatEuro(dr.totalIncome)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <ArrowDownRight size={10} className="text-rose-400" /> Gastos
              </p>
              <p className="text-sm font-bold text-white tabular-nums">{hideAmounts ? '•••' : formatEuro(dr.totalExpense)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <BarChart3 size={10} className="text-blue-400" /> Margen
              </p>
              <p className={`text-sm font-bold tabular-nums ${marginPct >= 30 ? 'text-emerald-400' : marginPct >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                {marginPct}%
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 flex flex-col justify-between" accent="blue" interactive onClick={() => setHideAmounts(!hideAmounts)}>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                <Wallet size={12} className="text-blue-400" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Pendiente Cobro</p>
            </div>
            <h3 className="text-3xl font-black tracking-tighter tabular-nums text-white">
              {hideAmounts ? '••••' : formatEuro(pendingCollection)}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-black text-blue-400 uppercase tracking-widest animate-pulse mt-3">
            <Clock size={10} /> Facturas Abiertas
          </div>
        </Card>
      </div>

      {/* Provisiones Fiscales */}
      <div className={`grid grid-cols-1 gap-4 ${dr.isAutonomo ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {/* IVA Neto */}
        <Card className="p-4 flex flex-col gap-2" accent="purple">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center border text-purple-400 bg-purple-500/10 border-purple-500/15">
              <Receipt size={14} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">IVA Neto (Mod.303)</p>
              <p className="text-[8px] text-slate-600 font-bold">{hideAmounts ? '' : `Rep. ${formatEuro(dr.ivaRepercutido)} · Sop. ${formatEuro(dr.ivaSoportado)}`}</p>
            </div>
          </div>
          <p className={`text-2xl font-black tabular-nums tracking-tighter ${dr.ivaNeto > 0 ? 'text-rose-400' : dr.ivaNeto < 0 ? 'text-emerald-400' : 'text-white'}`}>
            {hideAmounts ? '••••' : formatEuro(dr.ivaNeto)}
          </p>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">
            {dr.ivaNeto > 0 ? '▲ A pagar a Hacienda' : dr.ivaNeto < 0 ? '▼ Hacienda te debe' : 'Equilibrado'}
          </p>
        </Card>

        {/* IRPF Retenido — solo autónomos */}
        {dr.isAutonomo && (
          <Card className="p-4 flex flex-col gap-2" accent="amber">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center border text-amber-400 bg-amber-500/10 border-amber-500/15">
                <Scale size={14} />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">IRPF Retenido</p>
                <p className="text-[8px] text-slate-600 font-bold">Ya pagado por tus clientes</p>
              </div>
            </div>
            <p className="text-2xl font-black text-amber-400 tabular-nums tracking-tighter">
              {hideAmounts ? '••••' : formatEuro(dr.irpfRetenido)}
            </p>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">Ingresado en Hacienda</p>
          </Card>
        )}

        {/* Beneficio */}
        <Card className="p-4 flex flex-col gap-2" accent="none">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center border text-blue-400 bg-blue-500/10 border-blue-500/15">
              <BarChart3 size={14} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Beneficio Bruto</p>
              <p className="text-[8px] text-slate-600 font-bold">Base ingresos − Base gastos</p>
            </div>
          </div>
          <p className={`text-2xl font-black tabular-nums tracking-tighter ${dr.netProfit >= 0 ? 'text-white' : 'text-rose-400'}`}>
            {hideAmounts ? '••••' : formatEuro(dr.netProfit)}
          </p>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">Sin impuestos</p>
        </Card>
      </div>

      {/* Actividad Reciente + Beneficio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-0 overflow-hidden" accent="none">
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-purple-400" />
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Actividad Reciente</h3>
            </div>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{recentDocs.length} docs</span>
          </div>
          {recentDocs.length === 0 ? (
            <div className="p-10 text-center">
              <FileText size={32} className="mx-auto text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-600">Sin actividad aún</p>
              <p className="text-[10px] text-slate-700 uppercase tracking-widest mt-1">Crea tu primera factura</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${doc.type === 'invoice' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/15' : 'bg-amber-500/15 text-amber-400 border border-amber-500/15'}`}>
                    <FileText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-black text-white tabular-nums">{doc.number}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${STATUS_COLORS[doc.status] || 'bg-white/5 text-slate-400 border-white/10'}`}>
                        {doc.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold truncate">{doc.client_name || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white tabular-nums">{formatEuro(doc.total)}</p>
                    <p className="text-[9px] text-slate-600 font-bold">{formatDate(doc.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/20" accent="none">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Zap size={10} /> Consejo Fiscal
            </p>
            <p className="text-[10px] text-slate-300 font-bold leading-relaxed">
              {dr.ivaToPay > 0
                ? `Reserva ${formatEuro(dr.ivaToPay)} para la próxima liquidación de IVA.`
                : 'Registra gastos deducibles para reducir tu carga fiscal trimestral.'}
            </p>
          </Card>

          {/* VeriFactu Roadmap */}
          <Card className="p-4 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-emerald-500/20" accent="none">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <Radio size={11} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-none">Próximamente</p>
              </div>
            </div>
            <h4 className="text-[11px] font-black text-white mb-1">Conexión VeriFactu</h4>
            <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
              Trazabilidad fiscal automática conforme al{' '}
              <span className="text-slate-400">Real Decreto 1007/2023</span>.
              Faktio enviará cada factura firmada digitalmente a la AEAT en tiempo real.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-[35%] bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
              </div>
              <span className="text-[8px] font-black text-emerald-400/60 uppercase tracking-widest">35%</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Vencimientos Fiscales */}
      {taxDeadlines.length > 0 && (
        <Card className="p-5 border-amber-500/20 bg-amber-500/5" accent="amber">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/20">
              <Clock size={16} className="text-amber-400" />
            </div>
            <div>
              <h4 className="text-[9px] font-black text-amber-300 uppercase tracking-[0.3em]">Agente IA — Próximos Vencimientos Fiscales</h4>
              <p className="text-[8px] text-slate-500">Recibirás avisos automáticos 15 y 3 días antes</p>
            </div>
          </div>
          <div className="space-y-2">
            {taxDeadlines.slice(0, 3).map((d: any, idx: number) => {
              const urgencia = d.diasRestantes <= 3 ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' :
                               d.diasRestantes <= 7 ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
                               'bg-slate-800/80 border-white/5 text-slate-400';
              return (
                <div key={idx} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${urgencia}`}>
                  <div>
                    <p className="text-[10px] font-black">{d.nombre}</p>
                    <p className="text-[8px] opacity-70">Límite: {new Date(d.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black tabular-nums">{d.diasRestantes}</p>
                    <p className="text-[8px] font-bold opacity-70">días</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Sugerencias IA */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Card className="p-5 border-purple-500/30 bg-purple-500/5" accent="purple">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 bg-purple-500 text-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)] shrink-0">
                  <Zap size={16} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-[9px] font-black text-purple-300 uppercase tracking-[0.3em]">IA Fiscal</h4>
                  {alerts.map((msg, idx) => (
                    <p key={idx} className="text-xs font-bold text-slate-200">· {msg}</p>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProvisionCard({ icon, label, amount, color, hidden }: { icon: React.ReactNode; label: string; amount: number; color: 'purple' | 'amber'; hidden: boolean }) {
  const colors = color === 'purple'
    ? 'text-purple-400 bg-purple-500/10 border-purple-500/15'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/15';
  return (
    <Card className="p-4 flex flex-col gap-2" interactive accent={color}>
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${colors}`}>{icon}</div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
      </div>
      <p className="text-2xl font-black text-white tabular-nums tracking-tighter">
        {hidden ? '••••' : formatEuro(amount)}
      </p>
    </Card>
  );
}

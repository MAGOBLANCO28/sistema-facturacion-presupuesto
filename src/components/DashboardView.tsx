import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye, 
  EyeOff, 
  TrendingUp, 
  Receipt, 
  Scale, 
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  TrendingDown,
  Zap,
  Clock,
  Wallet
} from 'lucide-react';
import Card from './common/Card';

interface ReportData {
  totalIncome: number;
  totalExpense: number;
  ivaToPay: number;
  irpfProvision: number;
  realSalary: number;
  netProfit: number;
}

const formatEuro = (amount: number | undefined) => {
  if (typeof amount !== 'number') return '0,00 €';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

export default function DashboardView() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCollection, setPendingCollection] = useState(0);

  useEffect(() => {
    fetchReport();
    fetchPending();
  }, []);

  const fetchReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reports/real-income', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setReport(data);
      else setError(data.error);
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const fetchPending = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const docs = await res.json();
      const pending = docs
        .filter((d: any) => d.type === 'invoice' && d.status !== 'Pagada' && d.status !== 'Rectificativa')
        .reduce((acc: number, d: any) => acc + d.total, 0);
      setPendingCollection(pending);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
       <RefreshCw className="animate-spin text-purple-500" size={32} />
       <p className="text-slate-500 font-black animate-pulse uppercase tracking-[0.4em] text-[10px]">Sincronizando Módulo Deep Space...</p>
    </div>
  );

  if (!report) return null;

  const alerts = [];
  if (report.ivaToPay > 3000) alerts.push("Alerta Fiscal: Reserva de IVA elevada.");
  if (report.totalExpense < report.totalIncome * 0.1) alerts.push("Sugerencia: Revisa tus gastos deducibles.");
  
  const hasNotifications = alerts.length > 0;

  return (
    <div className="space-y-6 pb-24">
      {/* Metrics Grid Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-8 relative overflow-hidden h-64 flex flex-col justify-between" accent="purple">
           <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 scale-150 pointer-events-none text-purple-500">
             <TrendingUp size={140} />
           </div>
           <div>
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
                    <Zap size={16} className="text-purple-400" />
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Liquidez Real Disponible</p>
              </div>
              <h3 className="text-6xl font-black tracking-tighter tabular-nums text-white">
                {hideAmounts ? '••••••' : formatEuro(report.realSalary)}
              </h3>
           </div>
           <div className="flex gap-8 mt-4">
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ArrowUpRight size={12} className="text-emerald-400" /> Ingresos Brutos
                 </p>
                 <p className="text-sm font-bold text-white tabular-nums tracking-tight">
                    {hideAmounts ? '•••' : formatEuro(report.totalIncome)}
                 </p>
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ArrowDownRight size={12} className="text-rose-400" /> Gastos Totales
                 </p>
                 <p className="text-sm font-bold text-white tabular-nums tracking-tight">
                    {hideAmounts ? '•••' : formatEuro(report.totalExpense)}
                 </p>
              </div>
           </div>
        </Card>

        <Card className="p-8 flex flex-col justify-between h-64" accent="blue" interactive onClick={() => setHideAmounts(!hideAmounts)}>
           <div>
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                    <Wallet size={16} className="text-blue-400" />
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Pendiente de Cobro</p>
              </div>
              <h3 className="text-4xl font-black tracking-tighter tabular-nums text-white">
                {hideAmounts ? '••••' : formatEuro(pendingCollection)}
              </h3>
           </div>
           <div className="mt-auto">
              <div className="flex items-center gap-2 text-[10px] font-black text-blue-400 uppercase tracking-widest animate-pulse">
                 <Clock size={12} /> Facturas Abiertas
              </div>
           </div>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <ProvisionCard 
            icon={<Receipt size={20} />} 
            label="Reserva IVA" 
            amount={report.ivaToPay} 
            color="purple" 
            hidden={hideAmounts} 
         />
         <ProvisionCard 
            icon={<Scale size={20} />} 
            label="Provisión IRPF" 
            amount={report.irpfProvision} 
            color="amber" 
            hidden={hideAmounts} 
         />
         <Card className="p-6 flex flex-col justify-between" accent="none" interactive>
            <div className="flex items-center gap-3 mb-6">
               <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-all">
                  <ShieldCheck size={20} className="text-slate-400" />
               </div>
               <div>
                  <p className="text-xs font-black text-white uppercase tracking-tight">Compliance</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">VeriFactu Activo</p>
               </div>
            </div>
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
               <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Integridad 100%</span>
            </div>
         </Card>
      </div>

      {/* Conditional AI Suggestions */}
      <AnimatePresence>
        {hasNotifications && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Card className="p-6 border-purple-500/30 bg-purple-500/5 backdrop-blur-3xl" accent="purple">
              <div className="flex items-start gap-4">
                 <div className="w-10 h-10 bg-purple-500 text-white rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)] shrink-0">
                    <Zap size={20} />
                 </div>
                 <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-purple-300 uppercase tracking-[0.3em]">IA Fiscal Sugerencia</h4>
                    <div className="space-y-1">
                       {alerts.map((msg, idx) => (
                         <p key={idx} className="text-xs font-bold text-slate-200">· {msg}</p>
                       ))}
                    </div>
                 </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProvisionCard({ icon, label, amount, color, hidden }: { icon: React.ReactNode, label: string, amount: number, color: 'purple' | 'amber', hidden: boolean }) {
  const accentColor = color === 'purple' ? 'text-purple-400 bg-purple-500/10 border-purple-500/10' : 'text-amber-400 bg-amber-500/10 border-amber-500/10';
  const shadowColor = color === 'purple' ? 'hover:shadow-purple-500/20' : 'hover:shadow-amber-500/20';

  return (
    <Card className={`p-6 flex flex-col gap-4 group ${shadowColor}`} interactive accent={color}>
      <div className="flex items-center gap-3">
         <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${accentColor}`}>
            {icon}
         </div>
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
      </div>
      <div>
         <p className="text-3xl font-black text-white tabular-nums tracking-tighter">
            {hidden ? '••••' : formatEuro(amount)}
         </p>
         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 opacity-60">Impacto en Sueldo Neto</p>
      </div>
    </Card>
  );
}

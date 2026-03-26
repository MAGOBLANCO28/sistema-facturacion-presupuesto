import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  ArrowRightLeft, 
  Search, 
  Eye,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { DocumentData } from '../types';
import Card from './common/Card';

const AMBER = '#F59E0B';

interface Props {
  onEdit: (doc: DocumentData) => void;
  onPreview: (doc: DocumentData) => void;
}

export default function BudgetsView({ onEdit, onPreview }: Props) {
  const [budgets, setBudgets] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data: DocumentData[] = await res.json();
      setBudgets(data.filter(d => d.type === 'quote'));
    } catch (err) {
      console.error('Error fetching budgets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToInvoice = async (id: number) => {
    if (!confirm('¿Deseas convertir este presupuesto en una factura legal FAC-2026?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/convert/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchBudgets();
      }
    } catch (err) {
      console.error('Error converting:', err);
    }
  };

  const filtered = budgets.filter(b => 
    b.client_name?.toLowerCase().includes(search.toLowerCase()) || 
    b.number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter">Presupuestos</h2>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Pipeline Comercial / Propuestas 2026</p>
        </div>
        <div className="relative group w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-amber-400 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar propuesta..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl outline-none focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-sm text-white placeholder:text-slate-700 shadow-inner"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
           <div className="w-10 h-10 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Sincronizando Bóveda Amber...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-[3rem] p-24 text-center border-dashed border-white/5">
          <FileText className="mx-auto text-slate-800 mb-6" size={80} />
          <h3 className="text-xl font-black text-slate-500 uppercase tracking-tighter">Sin propuestas activas</h3>
          <p className="text-[10px] text-slate-700 font-black uppercase tracking-[0.3em] mt-2">Crea tu primer presupuesto premium para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filtered.map((budget) => (
            <Card key={budget.id} accent="amber" className="flex flex-col h-full" interactive>
              <div className="p-8 pb-4 flex-1">
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-2xl group-hover:rotate-6 transition-transform">
                      <FileText size={28} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">{budget.number}</p>
                      <p className="text-xs text-slate-500 font-bold">{budget.date}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 border ${budget.status === 'Convertido' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                    {budget.status}
                  </div>
                </div>

                <div className="space-y-1 mb-8">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">PROSPECTO</span>
                  <p className="text-2xl font-black text-white tracking-tighter truncate leading-none mb-1">{budget.client_name}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{budget.client_city || 'Ubicación Digital'}</p>
                </div>

                <div className="mb-4">
                   <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">VALOR PROPUESTA</span>
                   <p className="text-3xl font-black text-white tracking-tighter tabular-nums">
                     {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(budget.total)}
                   </p>
                </div>
              </div>

              <div className="p-6 bg-white/5 flex items-center gap-3 mt-auto border-t border-white/5">
                <button 
                  onClick={() => onPreview(budget)}
                  className="flex-1 py-3 bg-white/5 text-slate-400 hover:text-white rounded-xl border border-white/5 font-black text-[9px] uppercase tracking-widest transition-all hover:bg-white/10 flex items-center justify-center gap-2"
                >
                  <Eye size={14} /> Ver
                </button>
                
                {budget.status !== 'Convertido' && budget.status !== 'Rechazado' && (
                  <button 
                    onClick={() => budget.id && handleConvertToInvoice(budget.id)}
                    className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 hover:bg-amber-600"
                  >
                    <ArrowRightLeft size={14} /> Facturar
                  </button>
                )}
                
                {budget.status === 'Convertido' && (
                  <div className="flex-1 py-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2">
                    <CheckCircle2 size={14} /> Finalizado
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

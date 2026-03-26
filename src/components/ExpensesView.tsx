import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Image as ImageIcon,
  Calendar,
  Euro,
  X,
  Receipt,
  Scan,
  Loader2,
  ChevronUp,
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Expense } from '../types';
import Card from './common/Card';

const formatEuro = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

export default function ExpensesView() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    description: '',
    amount: 0,
    iva_rate: 21,
    category: 'Varios',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/expenses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setExpenses(data);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setOcrError(null);
    const formData = new FormData();
    formData.append('ticket', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/expenses/ocr', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      
      if (res.ok) {
        setNewExpense(prev => ({
          ...prev,
          description: data.description || 'Gasto Extraído',
          amount: data.amount || 0,
          iva_rate: data.iva_rate || 21,
          date: data.date || new Date().toISOString().split('T')[0],
          category: data.category || 'Varios',
          ticket_image_url: data.ticket_image_url
        }));
      } else {
         setOcrError(data.error || 'La IA no pudo procesar este ticket. Introduce los datos manualmente.');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      setOcrError('Fallo de conexión OCR. Por favor, introduce los datos a mano.');
    } finally {
      setIsOcrLoading(false);
      // Reset input value to allow selecting same file again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAdd = async () => {
    try {
      const token = localStorage.getItem('token');
      const rate = (newExpense.iva_rate || 0);
      const total = (newExpense.amount || 0);
      const iva_amount = total - (total / (1 + (rate / 100)));
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ ...newExpense, iva_amount })
      });
      setShowAddModal(false);
      setNewExpense({ description: '', amount: 0, iva_rate: 21, category: 'Varios', date: new Date().toISOString().split('T')[0] });
      setOcrError(null);
      fetchExpenses();
    } catch (err) {
      console.error('Error adding expense:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este gasto de forma permanente?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchExpenses();
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-2xl font-black text-white tracking-tighter">Bóveda de Gastos</h2>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:scale-105 active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest"
        >
          <Plus size={14} strokeWidth={3} /> Nuevo Gasto
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-20 bg-white/5 rounded-[2rem] border border-white/5">
             <div className="w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronizando Bóveda...</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="glass rounded-[2rem] p-16 text-center border-dashed border-white/10">
             <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-700 border border-white/5 shadow-inner">
               <Receipt size={32} />
             </div>
             <p className="text-sm font-black text-slate-400 uppercase tracking-widest font-mono">Vacío / Null</p>
             <p className="text-[10px] text-slate-600 font-bold mt-2">No hay gastos deducibles registrados en este periodo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {expenses.map((exp) => (
               <Card key={exp.id} className="p-4 flex items-center gap-4 group hover:border-purple-500/20" accent="none" interactive>
                 <div className="w-12 h-12 bg-slate-900 text-purple-400/80 rounded-xl flex items-center justify-center border border-white/5 shadow-inner group-hover:text-purple-400 transition-colors shrink-0">
                   {exp.ticket_image_url ? <ImageIcon size={20} /> : <Receipt size={20} />}
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="font-bold text-slate-200 text-sm tracking-tight truncate mb-1">{exp.description}</p>
                   <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                     <span className="bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-md border border-purple-500/20">{exp.category}</span>
                     <span className="flex items-center gap-1"><Calendar size={10} className="text-slate-600" /> {exp.date}</span>
                   </div>
                 </div>
                 <div className="text-right flex items-center gap-4 shrink-0">
                   <div className="text-right">
                     <p className="text-xl font-black text-white tracking-tighter tabular-nums">{formatEuro(exp.amount)}</p>
                   </div>
                   <button 
                     onClick={() => exp.id && handleDelete(exp.id)}
                     className="p-2.5 bg-slate-900 rounded-lg text-slate-600 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-500/20"
                   >
                     <Trash2 size={16} />
                   </button>
                 </div>
               </Card>
             ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowAddModal(false)}
               className="absolute inset-0"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0f172a] border border-white/10 w-full max-w-2xl rounded-[2rem] p-8 shadow-[0_0_80px_rgba(168,85,247,0.15)] relative z-10 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-xl font-black text-white tracking-tight">Registro de Ingreso/Gasto</h3>
                   <p className="text-[9px] text-purple-400 font-black uppercase tracking-widest mt-1 flex items-center gap-1">
                     <Zap size={10} fill="currentColor" /> Análisis OCR Directo
                   </p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all border border-white/5 hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              <div className="mb-8">
                 <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isOcrLoading}
                    className="w-full py-8 bg-slate-900 border-2 border-dashed border-purple-500/20 hover:border-purple-500/40 rounded-[1.5rem] flex flex-col items-center justify-center gap-3 transition-all group relative overflow-hidden"
                  >
                    {isOcrLoading && <div className="absolute inset-0 bg-purple-500/10 animate-pulse" />}
                    {isOcrLoading ? (
                       <Loader2 className="animate-spin text-purple-400 relative z-10" size={36} />
                    ) : (
                       <Scan className="text-purple-400 group-hover:scale-110 transition-transform relative z-10" size={36} />
                    )}
                    <div className="text-center relative z-10">
                       <span className="font-black uppercase text-[10px] tracking-widest text-slate-300">{isOcrLoading ? 'Procesando ticket...' : 'Auto-Scaneo de Ticket'}</span>
                       {!isOcrLoading && <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-widest font-bold">Subir foto para rellenar campos auto</p>}
                    </div>
                 </button>
                 {ocrError && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
                       <AlertCircle size={16} className="text-rose-400 shrink-0" />
                       <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">{ocrError}</p>
                    </motion.div>
                 )}
              </div>

              <div className="space-y-5">
                <CompactField label="Concepto / Comercio" value={newExpense.description || ''} onChange={v => setNewExpense({...newExpense, description: v})} placeholder="Ej. Restaurante Manolo..." autoFocus />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">Importe Bruto</label>
                    <div className="relative">
                      <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                      <input 
                        type="number" step="0.01" value={newExpense.amount}
                        onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value)})}
                        className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-black text-white tracking-tighter text-sm box-border"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">IVA Deducible</label>
                    <div className="relative">
                       <select 
                         value={newExpense.iva_rate}
                         onChange={e => setNewExpense({...newExpense, iva_rate: parseInt(e.target.value)})}
                         className="w-full px-4 py-3 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-bold text-white text-xs appearance-none cursor-pointer"
                       >
                         <option value={21}>21% General</option>
                         <option value={10}>10% Reducido</option>
                         <option value={4}>4% Superred.</option>
                         <option value={0}>0% Exento</option>
                       </select>
                       <ChevronUp className="absolute right-4 top-1/2 -translate-y-1/2 rotate-180 text-slate-600 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <CompactField type="date" label="Fecha" value={newExpense.date || ''} onChange={v => setNewExpense({...newExpense, date: v})} />
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">Clasificación</label>
                    <div className="relative">
                       <select 
                         value={newExpense.category}
                         onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                         className="w-full px-4 py-3 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-bold text-white text-xs appearance-none cursor-pointer"
                       >
                         <option>Varios</option>
                         <option>Tecnología</option>
                         <option>Suministros</option>
                         <option>Transporte</option>
                         <option>Formación</option>
                         <option>Comidas</option>
                       </select>
                       <ChevronUp className="absolute right-4 top-1/2 -translate-y-1/2 rotate-180 text-slate-600 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                   <button 
                     onClick={handleAdd}
                     className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                   >
                     <CheckCircle2 size={16} /> Confirmar Asiento
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompactField({ label, value, onChange, type = 'text', placeholder = '', autoFocus = false }: { label: string, value: string, onChange: (v: string) => void, type?: string, placeholder?: string, autoFocus?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
      <input 
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-4 py-3 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-bold text-slate-200 placeholder:text-slate-700 text-xs shadow-inner"
      />
    </div>
  );
}

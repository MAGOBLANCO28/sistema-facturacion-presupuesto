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
  AlertCircle,
  Save
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
  const [scanning, setScanning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    provider: '',
    nif: '',
    base: 0,
    iva: 0,
    total: 0,
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
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  // New handlers for the compact form
  const handleNumberChange = (field: string, value: string) => {
    const numValue = parseFloat(value);
    setFormData(prev => {
      const newFormData = { ...prev, [field]: isNaN(numValue) ? 0 : numValue };
      if (field === 'base' || field === 'iva_rate') {
        const base = newFormData.base;
        const ivaRate = newFormData.iva_rate;
        const ivaAmount = base * (ivaRate / 100);
        newFormData.iva = parseFloat(ivaAmount.toFixed(2));
        newFormData.total = parseFloat((base + ivaAmount).toFixed(2));
      } else if (field === 'iva') {
        const iva = newFormData.iva;
        const base = newFormData.base;
        newFormData.total = parseFloat((base + iva).toFixed(2));
        // Recalculate iva_rate if base is not zero
        if (base > 0) {
          newFormData.iva_rate = parseFloat(((iva / base) * 100).toFixed(0));
        }
      } else if (field === 'total') {
        const total = newFormData.total;
        const ivaRate = newFormData.iva_rate;
        const base = total / (1 + (ivaRate / 100));
        const ivaAmount = total - base;
        newFormData.base = parseFloat(base.toFixed(2));
        newFormData.iva = parseFloat(ivaAmount.toFixed(2));
      }
      return newFormData;
    });
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
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
        setFormData(prev => ({
          ...prev,
          description: data.description || '',
          provider: data.provider || '',
          nif: data.nif || '',
          date: data.date || new Date().toISOString().split('T')[0],
          category: data.category || 'Varios',
          base: data.base_amount || 0,
          iva: data.iva_amount || 0,
          total: data.amount || 0,
          iva_rate: data.iva_rate || 21,
        }));
      } else {
        setOcrError(data.error || 'No se pudo leer el documento');
      }
    } catch (err) {
      setOcrError('Error de conexión con el servidor');
    } finally {
      setScanning(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          description: formData.description,
          provider: formData.provider,
          nif: formData.nif,
          date: formData.date,
          category: formData.category,
          base_amount: formData.base,
          iva_amount: formData.iva,
          amount: formData.total, // total amount
          iva_rate: formData.iva_rate,
        })
      });
      setFormData({
        description: '', provider: '', nif: '', date: new Date().toISOString().split('T')[0],
        category: 'Varios', base: 0, iva: 0, total: 0, iva_rate: 21,
      });
      fetchExpenses();
    } catch (err) {
      console.error('Error adding expense:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-xl rotate-3 bg-gradient-to-br from-indigo-500 to-purple-600 border border-indigo-500/20">
          <Receipt size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white tracking-tighter">Gastos (OCR 2.0)</h2>
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.4em] mt-1">Escaneo y Registro Rápido</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Escáner IA - Compacto */}
        <Card className="md:col-span-1 p-5 flex flex-col justify-center gap-4 bg-white/5 backdrop-blur-md border border-white/10" accent="none">
          <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 mb-2">
            <Zap size={14} className="text-amber-400" /> Auto-Completar con IA
          </h3>
          
          <label className="relative cursor-pointer group flex-1">
            <div className={`w-full h-full min-h-[140px] rounded-2xl flex flex-col items-center justify-center overflow-hidden border-2 border-dashed transition-all relative z-10 ${scanning ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 group-hover:border-indigo-500/50 bg-slate-900 group-hover:bg-slate-800'}`}>
              
              <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleScan} disabled={scanning} />
              
              {scanning ? (
                <div className="flex flex-col items-center gap-3 text-indigo-400 px-4 text-center">
                  <Scan size={32} className="animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Analizando con IA...</span>
                  <span className="text-[9px] text-indigo-300/60 font-bold">Puede tardar unos segundos</span>
                </div>
              ) : ocrError ? (
                <div className="flex flex-col items-center gap-2 text-rose-400 px-4 text-center">
                  <AlertCircle size={24} />
                  <span className="text-[10px] font-black leading-snug">{ocrError}</span>
                  <span className="text-[9px] text-slate-500 font-bold">Toca para intentar de nuevo</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-indigo-400 transition-colors px-4 text-center">
                  <Scan size={28} />
                  <div className="space-y-0.5">
                    <span className="block text-xs font-black">Subir Ticket o Factura</span>
                    <span className="block text-[8px] font-bold uppercase tracking-widest text-slate-500">PDF · PNG · JPG</span>
                  </div>
                </div>
              )}
            </div>
          </label>
        </Card>

        {/* Formulario Manual - Compacto */}
        <Card className="md:col-span-2 p-5 space-y-4 bg-white/5 backdrop-blur-md border border-white/10" accent="none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Concepto" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ej. Restaurante Manolo" />
            <InputField label="Proveedor" value={formData.provider} onChange={e => setFormData({...formData, provider: e.target.value})} placeholder="Ej. Restaurante Manolo S.L." />
            <InputField label="NIF" value={formData.nif} onChange={e => setFormData({...formData, nif: e.target.value})} placeholder="Ej. B12345678" />
            <InputField label="Fecha" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} type="date" />
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Clasificación</label>
              <div className="relative">
                 <select 
                   value={formData.category}
                   onChange={e => setFormData({...formData, category: e.target.value})}
                   className="w-full px-4 py-2.5 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-bold text-white text-xs appearance-none cursor-pointer"
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
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">IVA Deducible</label>
              <div className="relative">
                 <select 
                   value={formData.iva_rate}
                   onChange={e => handleNumberChange('iva_rate', e.target.value)}
                   className="w-full px-4 py-2.5 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-bold text-white text-xs appearance-none cursor-pointer"
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
          <div className="grid grid-cols-3 gap-3 pt-2">
                 <InputField label="Base (€)" value={formData.base} onChange={e => handleNumberChange('base', e.target.value)} type="number" />
                 <InputField label="IVA (€)" value={formData.iva} onChange={e => handleNumberChange('iva', e.target.value)} type="number" />
                 <div className="space-y-1.5 px-1 relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total (€)</label>
                    <input type="number" value={formData.total} readOnly className="w-full bg-indigo-500/10 border border-indigo-500/20 py-2.5 rounded-xl font-black text-indigo-400 outline-none px-4 text-sm" />
                 </div>
              </div>
          

          <button 
            type="submit" 
            disabled={saving}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-[1.25rem] shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95 transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-3 mt-4"
          >
            {saving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
            Registrar Gasto
          </button>
        </Card>
      </form>

      {/* Listado Compacto */}
      <Card className="p-0 overflow-hidden bg-white/5 backdrop-blur-md border border-white/10" accent="none">
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
           <h3 className="text-sm font-black text-white uppercase tracking-widest">Últimos Gastos</h3>
        </div>
        {loading ? (
          <div className="text-center py-10">
             <Loader2 className="animate-spin text-slate-500 mx-auto" size={24} />
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-3">Cargando gastos...</p>
          </div>
        ) : expenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5">
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Concepto / Proveedor</th>
                  <th className="px-5 py-3">Categoría</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                       <p className="font-bold text-white text-sm truncate max-w-[200px]">{exp.description}</p>
                       <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">NIF: {exp.nif || '---'}</p>
                    </td>
                    <td className="px-5 py-3">
                       <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${exp.category === 'Otros' ? 'bg-slate-800 text-slate-400' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                         {exp.category}
                       </span>
                    </td>
                    <td className="px-5 py-3 text-right font-black text-white text-sm tracking-tighter">{formatEuro(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center flex flex-col items-center justify-center text-slate-500">
             <Receipt size={40} className="mb-4 opacity-20" />
             <p className="text-sm font-bold">No hay gastos registrados aún.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder = '', type = 'text', prefix }: any) {
  return (
    <div className="space-y-1.5 px-1 relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={e => e.target.removeAttribute('readonly')}
          className={`w-full bg-slate-900 border border-white/5 py-2.5 rounded-xl font-bold text-slate-200 outline-none focus:border-indigo-500/50 focus:bg-white/5 transition-all text-sm ${prefix ? 'pl-8' : 'px-4'}`}
        />
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Calendar, X, Receipt, Scan, Loader2, ChevronUp,
  Zap, Save, Download, Eye, FileText, AlertCircle, ExternalLink
} from 'lucide-react';
import { Expense } from '../types';
import Card from './common/Card';

const formatEuro = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

const authFetch = (path: string, opts?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
};

const CATEGORIES = ['Varios', 'Tecnología', 'Suministros', 'Transporte', 'Formación', 'Comidas', 'Alquiler', 'Publicidad', 'Servicios Profesionales'];

const CATEGORY_COLORS: Record<string, string> = {
  Tecnología: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Suministros: 'bg-green-500/10 text-green-400 border-green-500/20',
  Transporte: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Formación: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Comidas: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Alquiler: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Publicidad: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'Servicios Profesionales': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  Varios: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const EMPTY_FORM = {
  description: '', provider: '', nif: '',
  base: 0, iva: 0, total: 0, iva_rate: 21,
  category: 'Varios',
  date: new Date().toISOString().split('T')[0],
  ticket_image_url: '',
};

export default function ExpensesView() {
  const [expenses, setExpenses]           = useState<Expense[]>([]);
  const [loading, setLoading]             = useState(true);
  const [scanning, setScanning]           = useState(false);
  const [ocrError, setOcrError]           = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [formData, setFormData]           = useState(EMPTY_FORM);
  const [selectedExpense, setSelected]    = useState<Expense | null>(null);
  const [scannedPreview, setScannedPreview] = useState<string | null>(null); // preview local del archivo escaneado

  useEffect(() => { fetchExpenses(); }, []);

  const fetchExpenses = async () => {
    try {
      const res = await authFetch('/api/expenses');
      const data = await res.json();
      setExpenses(Array.isArray(data) ? data : []);
    } catch { } finally { setLoading(false); }
  };

  const handleNumberChange = (field: string, value: string) => {
    const num = parseFloat(value);
    setFormData(prev => {
      const f = { ...prev, [field]: isNaN(num) ? 0 : num };
      if (field === 'base' || field === 'iva_rate') {
        f.iva   = parseFloat((f.base * (f.iva_rate / 100)).toFixed(2));
        f.total = parseFloat((f.base + f.iva).toFixed(2));
      } else if (field === 'iva') {
        f.total = parseFloat((f.base + f.iva).toFixed(2));
        if (f.base > 0) f.iva_rate = parseFloat(((f.iva / f.base) * 100).toFixed(0));
      } else if (field === 'total') {
        f.base = parseFloat((f.total / (1 + f.iva_rate / 100)).toFixed(2));
        f.iva  = parseFloat((f.total - f.base).toFixed(2));
      }
      return f;
    });
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setOcrError(null);

    // Preview local inmediato
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setScannedPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setScannedPreview(null);
    }

    const fd = new FormData();
    fd.append('ticket', file);
    try {
      const res = await authFetch('/api/expenses/ocr', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        setFormData(prev => ({
          ...prev,
          description:      data.description       || '',
          provider:         data.provider           || '',
          nif:              data.nif                || '',
          date:             data.date               || prev.date,
          category:         data.category           || 'Varios',
          base:             data.base_amount        || 0,
          iva:              data.iva_amount         || 0,
          total:            data.amount             || 0,
          iva_rate:         data.iva_rate           || 21,
          ticket_image_url: data.ticket_image_url   || '',
        }));
      } else {
        setOcrError(data.error || 'No se pudo leer el documento');
      }
    } catch {
      setOcrError('Error de conexión con el servidor');
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Borrar este gasto?')) return;
    await authFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (selectedExpense?.id === id) setSelected(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description:      formData.description,
          provider:         formData.provider,
          nif:              formData.nif,
          date:             formData.date,
          category:         formData.category,
          base_amount:      formData.base,
          iva_amount:       formData.iva,
          amount:           formData.total,
          iva_rate:         formData.iva_rate,
          ticket_image_url: formData.ticket_image_url,
        }),
      });
      setFormData(EMPTY_FORM);
      setScannedPreview(null);
      fetchExpenses();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-xl rotate-3 bg-gradient-to-br from-indigo-500 to-purple-600">
          <Receipt size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white tracking-tighter">Gastos</h2>
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.4em] mt-1">OCR · Registro · Documentos</p>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Escáner IA */}
        <Card className="md:col-span-1 p-5 flex flex-col justify-center gap-4 bg-white/5 backdrop-blur-md border border-white/10" accent="none">
          <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 mb-2">
            <Zap size={14} className="text-amber-400" /> Auto-Completar con IA
          </h3>
          <label className="relative cursor-pointer group flex-1">
            <div className={`w-full min-h-[160px] rounded-2xl flex flex-col items-center justify-center overflow-hidden border-2 border-dashed transition-all relative z-10
              ${scanning ? 'border-indigo-400 bg-indigo-950/60'
              : ocrError  ? 'border-rose-500/50 bg-rose-950/20'
              : scannedPreview ? 'border-emerald-500/50 bg-slate-900'
              : 'border-white/10 group-hover:border-indigo-500/50 bg-slate-900 group-hover:bg-slate-800'}`}>
              <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleScan} disabled={scanning} />
              {scanning ? (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-900 border-t-indigo-400 animate-spin" />
                    <Scan size={18} className="text-indigo-300 absolute inset-0 m-auto" />
                  </div>
                  <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">Analizando...</span>
                </div>
              ) : ocrError ? (
                <div className="flex flex-col items-center gap-2 text-rose-400 px-4 text-center">
                  <AlertCircle size={22} />
                  <span className="text-[10px] font-black">{ocrError}</span>
                  <span className="text-[9px] text-slate-500">Toca para reintentar</span>
                </div>
              ) : scannedPreview ? (
                <div className="relative w-full h-full min-h-[160px]">
                  <img src={scannedPreview} alt="Ticket" className="w-full h-full object-cover rounded-2xl opacity-80" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Cambiar archivo</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-indigo-400 transition-colors px-4 text-center">
                  <Scan size={26} />
                  <div>
                    <span className="block text-xs font-black">Subir Ticket o Factura</span>
                    <span className="block text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">PDF · PNG · JPG</span>
                  </div>
                </div>
              )}
            </div>
          </label>
        </Card>

        {/* Formulario manual */}
        <Card className="md:col-span-2 p-5 space-y-4 bg-white/5 backdrop-blur-md border border-white/10" accent="none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Concepto" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ej. Restaurante Manolo" />
            <InputField label="Proveedor" value={formData.provider} onChange={e => setFormData({...formData, provider: e.target.value})} placeholder="Ej. Restaurante Manolo S.L." />
            <InputField label="NIF / CIF" value={formData.nif} onChange={e => setFormData({...formData, nif: e.target.value})} placeholder="Ej. B12345678" />
            <InputField label="Fecha" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} type="date" />
            <SelectField label="Clasificación" value={formData.category} onChange={v => setFormData({...formData, category: v})}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </SelectField>
            <SelectField label="IVA Deducible" value={formData.iva_rate} onChange={v => handleNumberChange('iva_rate', v)}>
              <option value={21}>21% General</option>
              <option value={10}>10% Reducido</option>
              <option value={4}>4% Superred.</option>
              <option value={0}>0% Exento</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <InputField label="Base (€)" value={formData.base} onChange={e => handleNumberChange('base', e.target.value)} type="number" />
            <InputField label="IVA (€)" value={formData.iva} onChange={e => handleNumberChange('iva', e.target.value)} type="number" />
            <div className="space-y-1.5 px-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total (€)</label>
              <input type="number" value={formData.total} readOnly className="w-full bg-indigo-500/10 border border-indigo-500/20 py-2.5 rounded-xl font-black text-indigo-400 outline-none px-4 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-[1.25rem] shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95 transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-3 mt-2">
            {saving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
            Registrar Gasto
          </button>
        </Card>
      </form>

      {/* Listado */}
      <Card className="p-0 overflow-hidden bg-white/5 backdrop-blur-md border border-white/10" accent="none">
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Últimos Gastos</h3>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-500/20 transition-all">
            <Download size={12} /> Exportar CSV
          </button>
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
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors group/row cursor-pointer"
                    onClick={() => setSelected(exp)}>
                    <td className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      {new Date(exp.date).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-bold text-white text-sm truncate max-w-[200px]">{exp.description}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                        {exp.provider || exp.nif ? `${exp.provider || ''}${exp.nif ? ' · NIF: ' + exp.nif : ''}` : '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS['Varios']}`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-black text-white text-sm tracking-tighter">
                      {formatEuro(exp.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity justify-end">
                        <button onClick={e => { e.stopPropagation(); setSelected(exp); }}
                          className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-slate-600 hover:text-indigo-400 transition-all" title="Ver detalle">
                          <Eye size={14} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(exp.id!); }}
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-all" title="Borrar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center flex flex-col items-center text-slate-500">
            <Receipt size={40} className="mb-4 opacity-20" />
            <p className="text-sm font-bold">No hay gastos registrados aún.</p>
          </div>
        )}
      </Card>

      {/* Panel detalle */}
      {selectedExpense && (
        <ExpenseDetailPanel
          expense={selectedExpense}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

/* ── Panel de detalle deslizante ───────────────── */
function ExpenseDetailPanel({ expense, onClose, onDelete }: {
  expense: Expense;
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  const isPDF  = expense.ticket_image_url?.toLowerCase().endsWith('.pdf');
  const isImg  = expense.ticket_image_url && !isPDF;
  const catColor = CATEGORY_COLORS[expense.category] || CATEGORY_COLORS['Varios'];
  const [fileError, setFileError] = React.useState(false);

  const openFile = async (url: string) => {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) { setFileError(true); return; }
      window.open(url, '_blank');
    } catch {
      setFileError(true);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#0f172a] border-l border-white/10 z-50 flex flex-col shadow-2xl overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/5 sticky top-0 z-10">
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Detalle de Gasto</p>
            <h3 className="text-lg font-black text-white mt-0.5 leading-tight">{expense.description}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">

          {/* Documento adjunto */}
          {expense.ticket_image_url ? (
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Documento adjunto</p>
              {isImg ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900">
                  <img
                    src={expense.ticket_image_url}
                    alt="Ticket"
                    className="w-full object-contain max-h-80"
                  />
                  <a
                    href={expense.ticket_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur text-white text-[9px] font-black rounded-xl border border-white/20 hover:bg-black/80 transition-all uppercase tracking-widest"
                  >
                    <ExternalLink size={12} /> Ver original
                  </a>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="w-12 h-12 bg-red-500/15 rounded-xl flex items-center justify-center shrink-0">
                      <FileText size={22} className="text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white">Factura PDF</p>
                      <p className="text-[10px] text-slate-500 truncate">{expense.ticket_image_url!.split('/').pop()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openFile(expense.ticket_image_url!)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/15 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/25 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest"
                      >
                        <ExternalLink size={12} /> Abrir
                      </button>
                      <a
                        href={expense.ticket_image_url!}
                        download
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest"
                      >
                        <Download size={12} /> Guardar
                      </a>
                    </div>
                  </div>
                  {fileError && (
                    <p className="text-[10px] text-amber-400 font-bold mt-2 px-1">
                      ⚠ El archivo ya no está disponible en el servidor. Vuelve a registrar el gasto escaneando el documento.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
              <Receipt size={18} className="text-slate-600 shrink-0" />
              <p className="text-[11px] text-slate-500 font-bold">Sin documento adjunto</p>
            </div>
          )}

          {/* Info principal */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Fecha" value={new Date(expense.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} />
            <InfoRow label="Categoría" value={
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${catColor}`}>
                {expense.category}
              </span>
            } />
            {expense.provider && <InfoRow label="Proveedor" value={expense.provider} />}
            {expense.nif      && <InfoRow label="NIF / CIF" value={expense.nif} />}
          </div>

          {/* Importes */}
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Desglose</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex justify-between items-center px-5 py-3 border-b border-white/5">
                <span className="text-xs text-slate-400">Base imponible</span>
                <span className="text-sm font-bold text-white">{formatEuro(expense.base_amount || 0)}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-3 border-b border-white/5">
                <span className="text-xs text-slate-400">IVA ({expense.iva_rate}%) deducible</span>
                <span className="text-sm font-bold text-indigo-400">{formatEuro(expense.iva_amount)}</span>
              </div>
              <div className="flex justify-between items-center px-5 py-4 bg-indigo-500/5">
                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Total pagado</span>
                <span className="text-xl font-black text-white">{formatEuro(expense.amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/5 sticky bottom-0">
          <button
            onClick={() => onDelete(expense.id!)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest">
            <Trash2 size={14} /> Eliminar gasto
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Helpers ───────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: {
  label: string; value: any; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 px-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-0">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-900 border border-white/5 rounded-xl outline-none focus:bg-slate-800 transition-all font-bold text-white text-xs appearance-none cursor-pointer">
          {children}
        </select>
        <ChevronUp className="absolute right-4 top-1/2 -translate-y-1/2 rotate-180 text-slate-600 pointer-events-none" size={14} />
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder = '', type = 'text' }: any) {
  return (
    <div className="space-y-1.5 px-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-slate-900 border border-white/5 py-2.5 rounded-xl font-bold text-slate-200 outline-none focus:border-indigo-500/50 focus:bg-white/5 transition-all text-sm px-4" />
    </div>
  );
}

async function exportCSV() {
  const token = localStorage.getItem('token');
  const res  = await fetch('/api/export/expenses', { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'libro_gastos.csv'; a.click();
  URL.revokeObjectURL(url);
}

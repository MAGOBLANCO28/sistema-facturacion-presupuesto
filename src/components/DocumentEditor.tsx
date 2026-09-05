import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Save, FileText, Calendar as CalendarIcon, Hash, User, CheckCircle2 } from 'lucide-react';
import { DocumentType, DocumentData, DocumentItem, CompanySettings } from '../types';

const formatEuro = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    useGrouping: true
  }).format(amount);
};

interface Props {
  type: DocumentType;
  initialData: DocumentData | null;
  onSave: () => void;
  settings: CompanySettings | null;
}

const ACCENT = '#4F46E5';
const AMBER = '#F59E0B';

export default function DocumentEditor({ type, initialData, onSave, settings }: Props) {
  const [formData, setFormData] = useState<DocumentData>({
    type,
    number: '',
    date: new Date().toISOString().split('T')[0],
    client_name: '',
    client_dni: '',
    client_address: '',
    client_city: '',
    client_zip: '',
    client_province: '',
    items: [{ id: Math.random().toString(36).substr(2, 9), concept: '', quantity: 1, unit_price: 0, total: 0 }],
    subtotal: 0,
    iva_rate: 21,
    iva_amount: 0,
    irpf_rate: 0,
    irpf_amount: 0,
    total: 0,
    status: type === 'invoice' ? 'Emitida' : 'Borrador',
  });

  const [manualSubtotal, setManualSubtotal] = useState<string | null>(null);
  const [manualTotal, setManualTotal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const pendingSaveStatus = useRef<string | undefined>(undefined);

  // Initialize IRPF rate from settings (only for invoices, only for autónomos)
  useEffect(() => {
    if (!initialData && type !== 'abono' && settings) {
      const accountType = (settings as any).account_type || 'autonomo';
      const irpfRate = accountType === 'autonomo' ? ((settings as any).irpf_rate || 15) : 0;
      setFormData(prev => ({ ...prev, irpf_rate: irpfRate }));
    }
  }, [settings]);

  useEffect(() => {
    if (!initialData) {
      const token = localStorage.getItem('token');
      fetch(`/api/next-number/${type}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => {
          if (data.number) {
            setFormData(prev => ({ ...prev, number: data.number, type }));
          }
        })
        .catch((err) => { console.error('Error obteniendo número de documento:', err); });
    } else {
      setFormData({
        ...initialData,
        items: (initialData.items || []).map(item => ({
          ...item,
          unit_price: item.unit_price ?? (item.quantity > 0 ? parseFloat((item.total / item.quantity).toFixed(2)) : item.total),
        }))
      });
    }
  }, [initialData, type]);

  useEffect(() => {
    const calculatedSubtotal = (formData.items || []).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const subtotalToUse = manualSubtotal !== null && manualSubtotal !== '' ? Number(manualSubtotal) : calculatedSubtotal;
    const iva_amount = subtotalToUse * (formData.iva_rate / 100);
    const calculatedTotal = subtotalToUse + iva_amount;
    const totalToUse = manualTotal !== null && manualTotal !== '' ? Number(manualTotal) : calculatedTotal;
    const irpf_rate = formData.irpf_rate || 0;
    const irpf_amount = parseFloat((subtotalToUse * (irpf_rate / 100)).toFixed(2));
    setFormData(prev => ({
      ...prev,
      subtotal: subtotalToUse,
      iva_amount,
      irpf_amount,
      total: totalToUse
    }));
  }, [formData.items, formData.iva_rate, formData.irpf_rate, manualSubtotal, manualTotal]);

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Math.random().toString(36).substr(2, 9), concept: '', quantity: 1, unit_price: 0, total: 0 }]
    }));
  };

  const handleRemoveItem = (id: string) => {
    if (formData.items.length === 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const handleItemChange = (id: string, field: keyof DocumentItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updated.total = parseFloat(((updated.quantity || 0) * (updated.unit_price || 0)).toFixed(2));
        }
        return updated;
      })
    }));
  };

  const handleSubmit = async (e: React.FormEvent, saveStatus?: string) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const dataToSave = { ...formData };
      const statusOverride = saveStatus || pendingSaveStatus.current;
      if (statusOverride) dataToSave.status = statusOverride as any;
      pendingSaveStatus.current = undefined;

      // Los abonos siempre se emiten con importes negativos (nota de crédito)
      if (type === 'abono') {
        dataToSave.status = 'Emitida';
        dataToSave.subtotal   = -Math.abs(dataToSave.subtotal);
        dataToSave.iva_amount = -Math.abs(dataToSave.iva_amount);
        dataToSave.total      = -Math.abs(dataToSave.total);
        if (dataToSave.irpf_amount) dataToSave.irpf_amount = -Math.abs(dataToSave.irpf_amount);
        dataToSave.items = dataToSave.items.map(item => ({
          ...item,
          total: -Math.abs(item.total),
        }));
        dataToSave.is_rectificative = true;
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(dataToSave),
      });
      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => onSave(), 1400);
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Error al guardar. Inténtalo de nuevo.');
        setTimeout(() => setSaveError(''), 4000);
      }
    } catch (err) {
      setSaveError('Sin conexión con el servidor. Comprueba que está corriendo.');
      setTimeout(() => setSaveError(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  const currentAccent = type === 'invoice' ? ACCENT : type === 'abono' ? '#ef4444' : AMBER;

  return (
    <div className="bg-slate-900 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] border border-white/5 overflow-hidden max-w-4xl mx-auto flex flex-col">
      {/* Header Premium */}
      <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3" style={{ backgroundColor: currentAccent }}>
            <FileText size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight leading-none mb-1 text-white">
              {initialData ? 'Editar' : 'Nuevo'} {type === 'invoice' ? 'Factura' : type === 'abono' ? 'Abono' : 'Presupuesto'}
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Módulo VeriFactu Pro</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (document.getElementById('document-form') as HTMLFormElement)?.requestSubmit()}
          disabled={loading}
          className="flex items-center gap-3 px-8 py-4 text-white rounded-[1.25rem] transition-all font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: currentAccent }}
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
          <span>{type === 'invoice' ? 'Emitir Factura' : type === 'abono' ? 'Emitir Abono' : 'Guardar Presupuesto'}</span>
        </button>
      </div>

      <form id="document-form" className="p-8 space-y-10" onSubmit={handleSubmit}>
        {/* Company & Numbering Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="flex items-center gap-6 p-6 bg-white/5 rounded-[2rem] border border-white/5">
            <div className="w-20 h-20 flex items-center justify-center flex-shrink-0 bg-white rounded-2xl shadow-sm p-3 border border-white/10">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <div className="text-3xl font-black" style={{ color: currentAccent }}>{settings?.company_name?.[0] || 'F'}</div>
              )}
            </div>
            <div className="space-y-1">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">EMISOR</p>
               <p className="font-black text-white tracking-tight leading-none text-lg truncate max-w-[180px]">{settings?.company_name || 'Configurar Empresa'}</p>
               <p className="text-[10px] font-bold text-slate-400">NIF: {settings?.cif || '---'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                <Hash size={12} /> {type === 'invoice' ? 'Factura Número' : type === 'abono' ? 'Abono Número' : 'Presupuesto Número'}
              </label>
              <input
                type="text"
                value={formData.number}
                onChange={e => setFormData({ ...formData, number: e.target.value })}
                className="w-full px-5 py-3.5 bg-slate-800 border border-white/20 rounded-2xl outline-none text-sm font-black tracking-tight focus:bg-slate-700 focus:ring-4 focus:ring-purple-500/20 transition-all text-white"
                style={{ color: 'white' }}
                placeholder="FAC-2026-001"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                <CalendarIcon size={12} /> Fecha
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-5 py-3.5 bg-slate-800 border border-white/20 rounded-2xl outline-none text-sm font-bold focus:bg-slate-700 focus:ring-4 focus:ring-purple-500/20 transition-all [color-scheme:dark] text-white"
                style={{ color: 'white' }}
                required
              />
            </div>
          </div>
        </div>

        {/* Client Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white shadow-lg border border-white/10">
              <User size={12} />
            </div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">DATOS DEL RECEPTOR</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <InputGroup label="Cliente / Razón Social" value={formData.client_name} onChange={v => setFormData({ ...formData, client_name: v })} placeholder="Nombre del cliente" required />
            <InputGroup label="NIF / CIF" value={formData.client_dni} onChange={v => setFormData({ ...formData, client_dni: v })} placeholder="Identificación fiscal" />
            <InputGroup label="Dirección Postal" value={formData.client_address} onChange={v => setFormData({ ...formData, client_address: v })} placeholder="Calle y número" />
            <InputGroup label="Ciudad" value={formData.client_city} onChange={v => setFormData({ ...formData, client_city: v })} placeholder="Municipio" />
            <InputGroup label="Código Postal" value={formData.client_zip || ''} onChange={v => setFormData({ ...formData, client_zip: v })} placeholder="00000" />
            <InputGroup label="Provincia" value={formData.client_province || ''} onChange={v => setFormData({ ...formData, client_province: v })} placeholder="Provincia" />
            {type === 'invoice' && (
              <>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    <CalendarIcon size={12} /> Fecha de vencimiento
                  </label>
                  <input
                    type="date"
                    value={(formData as any).fecha_vencimiento || ''}
                    onChange={e => setFormData({ ...formData, fecha_vencimiento: e.target.value } as any)}
                    className="w-full px-5 py-3.5 bg-slate-800 border border-white/20 rounded-2xl outline-none text-sm font-bold focus:bg-slate-700 focus:ring-4 focus:ring-purple-500/20 transition-all [color-scheme:dark] text-white"
                    style={{ color: 'white' }}
                  />
                </div>
                <InputGroup
                  label="Email del cliente (recordatorios)"
                  value={(formData as any).client_email || ''}
                  onChange={v => setFormData({ ...formData, client_email: v } as any)}
                  placeholder="cliente@empresa.com"
                  type="email"
                />
              </>
            )}
          </div>
        </div>

        {/* Concepts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
             <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white shadow-lg border border-white/10">
                  <Plus size={12} />
                </div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">CONCEPTOS DEL DOCUMENTO</h3>
             </div>
             <button type="button" onClick={handleAddItem} className="px-4 py-2 bg-slate-800 border border-white/10 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all shadow-lg shadow-purple-500/10">
               + Añadir Línea
             </button>
          </div>

          <div className="rounded-[2rem] border border-white/5 overflow-hidden shadow-sm bg-white/5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950 text-slate-300">
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">Descripción</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-center w-20">Cant.</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-right w-36">Precio unit. (€)</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-right w-32">Total (€)</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-900 border-t border-white/5">
                {(formData.items || []).map((item) => (
                  <tr key={item.id} className="group hover:bg-white/5 transition-colors">
                    <td className="px-8 py-4">
                      <input type="text" value={item.concept} onChange={e => handleItemChange(item.id, 'concept', e.target.value)} className="w-full bg-transparent outline-none text-sm font-bold text-slate-200" placeholder="Ej: Consultoría fiscal avanzada..." required />
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="number"
                        value={item.quantity === 0 ? '' : item.quantity}
                        placeholder="1"
                        onChange={e => handleItemChange(item.id, 'quantity', e.target.value === '' ? 0 : Number(e.target.value))}
                        onFocus={e => e.target.select()}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 outline-none text-sm text-center font-bold text-slate-300 focus:border-purple-400/50 focus:bg-white/10 transition-all"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_price === 0 ? '' : item.unit_price}
                        placeholder="0,00"
                        onChange={e => handleItemChange(item.id, 'unit_price', e.target.value === '' ? 0 : Number(e.target.value))}
                        onFocus={e => e.target.select()}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 outline-none text-sm text-right font-bold text-slate-300 tracking-tighter focus:border-purple-400/50 focus:bg-white/10 transition-all"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="w-full px-2 py-1 text-sm text-right font-black text-white tracking-tighter tabular-nums">
                        {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.total)}
                      </div>
                    </td>
                    <td className="pr-4 py-4 text-center">
                      <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-500 hover:text-rose-400 transition-colors" disabled={formData.items.length === 1}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals Section */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 pt-8 border-t border-white/5">
          <div className="flex-1" />

          <div className="w-full md:w-80 space-y-3">
            <div className="flex justify-between items-center px-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
              <div className="flex items-center gap-1">
                <input type="number" step="0.01" value={manualSubtotal !== null ? manualSubtotal : formData.subtotal.toFixed(2)} onChange={e => setManualSubtotal(e.target.value)} onFocus={e => e.target.select()} className="bg-transparent outline-none text-right font-black text-sm w-24 text-slate-300 tracking-tighter" />
                <span className="text-slate-500 font-bold">€</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center px-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impuesto IVA</span>
                <select value={formData.iva_rate} onChange={e => setFormData({ ...formData, iva_rate: Number(e.target.value) })} className="px-2 py-1 rounded-lg text-[10px] font-black outline-none focus:ring-1 focus:ring-purple-500/30" style={{ backgroundColor: '#1e293b', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <option value={21} style={{ backgroundColor: '#1e293b', color: 'white' }}>21%</option>
                  <option value={10} style={{ backgroundColor: '#1e293b', color: 'white' }}>10%</option>
                  <option value={4} style={{ backgroundColor: '#1e293b', color: 'white' }}>4%</option>
                  <option value={0} style={{ backgroundColor: '#1e293b', color: 'white' }}>0%</option>
                </select>
              </div>
              <span className="font-black text-sm text-slate-200 tracking-tighter">{formatEuro(formData.iva_amount)}</span>
            </div>

            {type !== 'abono' && (formData.irpf_rate || 0) > 0 && (
              <div className="flex justify-between items-center px-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Ret. IRPF</span>
                  <select
                    value={formData.irpf_rate || 0}
                    onChange={e => setFormData({ ...formData, irpf_rate: Number(e.target.value) })}
                    className="px-2 py-1 rounded-lg text-[10px] font-black outline-none"
                    style={{ backgroundColor: '#1e293b', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <option value={0} style={{ backgroundColor: '#1e293b', color: 'white' }}>0%</option>
                    <option value={7} style={{ backgroundColor: '#1e293b', color: 'white' }}>7%</option>
                    <option value={15} style={{ backgroundColor: '#1e293b', color: 'white' }}>15%</option>
                  </select>
                </div>
                <span className="font-black text-sm text-amber-400 tracking-tighter">-{((formData.irpf_rate || 0) > 0 && formData.subtotal > 0) ? new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'}).format(formData.irpf_amount || 0) : '0,00 €'}</span>
              </div>
            )}

            <div className="p-6 bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col gap-1 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-slate-200 tracking-[0.3em] opacity-40">{type === 'quote' ? 'Total Presupuesto' : 'Total Factura'}</span>
                <div className="flex items-center gap-1">
                  <input type="number" step="0.01" value={manualTotal !== null ? manualTotal : formData.total.toFixed(2)} onChange={e => setManualTotal(e.target.value)} onFocus={e => e.target.select()} className="bg-transparent outline-none text-right font-black text-2xl w-32 text-slate-200 tracking-tighter tabular-nums" />
                  <span className="font-black text-2xl text-slate-200">€</span>
                </div>
              </div>
              {type !== 'abono' && (formData.irpf_rate || 0) > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">A Cobrar (neto)</span>
                  <span className="font-black text-lg text-emerald-400 tabular-nums">
                    {new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'}).format((formData.total || 0) - (formData.irpf_amount || 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {saveError && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-rose-900/90 border border-rose-500/30 rounded-2xl text-rose-200 font-black text-sm shadow-2xl backdrop-blur-sm flex items-center gap-3">
          <span className="text-rose-400">✗</span> {saveError}
        </div>
      )}

      {savedSuccess && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="bg-slate-800 border border-emerald-500/30 rounded-[2.5rem] p-12 flex flex-col items-center gap-4 shadow-2xl"
          >
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(16,185,129,0.5)]">
              <CheckCircle2 size={34} />
            </div>
            <h3 className="text-xl font-black text-white">{type === 'quote' ? 'Presupuesto guardado' : 'Factura emitida'}</h3>
            <p className="text-sm text-slate-400 font-bold">Redirigiendo...</p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

function InputGroup({ label, value, onChange, placeholder, required, type = 'text' }: { label: string, value: string, onChange: (v: string) => void, placeholder: string, required?: boolean, type?: string }) {
  return (
    <div className="space-y-1.5 px-1 flex flex-col items-start">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-white/10 py-1 font-bold text-slate-200 outline-none focus:border-purple-400 transition-colors text-sm"
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

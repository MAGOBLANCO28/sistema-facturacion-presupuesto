import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Plus, Trash2, Edit3, X, Save, Power, Calendar, User, FileText, Lock } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import UpgradeModal from './UpgradeModal';
import { PLAN_REQUIRED } from '../context/PlanContext';

const authFetch = (url: string, opts?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
};

interface RecurringItem {
  concept: string;
  quantity: number;
  price: number;
  total: number;
}

interface Recurring {
  id: number;
  name: string;
  client_name: string;
  client_email: string | null;
  items: RecurringItem[];
  iva_rate: number;
  irpf_rate: number;
  frequency: string;
  next_date: string;
  active: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  name: '',
  client_name: '',
  client_dni: '',
  client_address: '',
  client_city: '',
  client_email: '',
  iva_rate: 21,
  irpf_rate: 0,
  frequency: 'monthly',
  next_date: '',
  items: [{ concept: '', quantity: 1, price: 0, total: 0 }] as RecurringItem[],
};

export default function RecurringView() {
  const { plan, canUse } = usePlan();
  const [list, setList] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(false);

  const fetchList = useCallback(async () => {
    if (!canUse('recurring')) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authFetch('/api/recurring');
      if (res.ok) setList(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [canUse]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, next_date: new Date().toISOString().split('T')[0] });
    setShowForm(true);
  };

  const openEdit = (r: Recurring) => {
    setEditing(r);
    setForm({
      name: r.name,
      client_name: r.client_name,
      client_dni: '',
      client_address: '',
      client_city: '',
      client_email: r.client_email || '',
      iva_rate: r.iva_rate,
      irpf_rate: r.irpf_rate,
      frequency: r.frequency,
      next_date: r.next_date.split('T')[0],
      items: r.items,
    });
    setShowForm(true);
  };

  const updateItem = (i: number, field: keyof RecurringItem, val: string | number) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: val };
    if (field === 'quantity' || field === 'price') {
      items[i].total = (Number(items[i].quantity) || 0) * (Number(items[i].price) || 0);
    }
    setForm(f => ({ ...f, items }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.client_name.trim() || !form.next_date) return;
    setSaving(true);
    try {
      const payload = { ...form };
      const url = editing ? `/api/recurring/${editing.id}` : '/api/recurring';
      const method = editing ? 'PUT' : 'POST';
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      if (res.ok) { setShowForm(false); fetchList(); }
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta factura recurrente?')) return;
    await authFetch(`/api/recurring/${id}`, { method: 'DELETE' });
    fetchList();
  };

  const handleToggle = async (r: Recurring) => {
    await authFetch(`/api/recurring/${r.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...r, items: r.items, active: !r.active }),
    });
    fetchList();
  };

  if (!canUse('recurring')) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
            <RefreshCw size={18} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tighter">Facturas Recurrentes</h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Automatización · Plan Profesional</p>
          </div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-4">
          <Lock size={36} className="text-slate-600" />
          <div>
            <p className="font-black text-white text-lg">Función del Plan Profesional</p>
            <p className="text-slate-500 text-sm font-bold mt-1">Configura facturas que se generan solas cada mes</p>
          </div>
          <button
            onClick={() => setUpgradeModal(true)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all"
          >
            Ver Plan Profesional
          </button>
        </div>
        <UpgradeModal open={upgradeModal} onClose={() => setUpgradeModal(false)} feature="recurring" currentPlan={plan} requiredPlan={PLAN_REQUIRED['recurring']} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
            <RefreshCw size={18} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tighter">Facturas Recurrentes</h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{list.length} plantillas activas</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
        >
          <Plus size={13} /> Nueva recurrente
        </button>
      </div>

      <div className="bg-purple-500/5 border border-purple-500/15 rounded-2xl px-4 py-3 flex items-center gap-2.5">
        <RefreshCw size={11} className="text-purple-400 shrink-0" />
        <p className="text-[10px] text-purple-300/70 font-bold">
          Faktio genera automáticamente la factura cada día a las 7:00 cuando llega la fecha programada. Revísalas en Historial.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white/3 border border-white/8 rounded-3xl p-12 text-center">
          <RefreshCw size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="font-black text-white">Sin plantillas todavía</p>
          <p className="text-slate-500 text-sm font-bold mt-1">Crea tu primera factura recurrente para clientes fijos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(r => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`bg-white/3 border rounded-2xl p-4 transition-all ${r.active ? 'border-white/8 hover:border-white/15' : 'border-white/4 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-white text-sm">{r.name}</p>
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                      r.active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'
                    }`}>{r.active ? 'Activa' : 'Pausada'}</span>
                    <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest text-purple-400">
                      {FREQUENCY_LABELS[r.frequency] || r.frequency}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold"><User size={9} /> {r.client_name}</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold"><Calendar size={9} /> Próxima: {new Date(r.next_date).toLocaleDateString('es-ES')}</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold"><FileText size={9} /> {r.items.length} conceptos</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleToggle(r)} title={r.active ? 'Pausar' : 'Activar'}
                    className={`p-2 rounded-xl transition-all border ${r.active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`}>
                    <Power size={12} />
                  </button>
                  <button onClick={() => openEdit(r)} className="p-2 bg-white/5 border border-white/5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                    <Edit3 size={12} />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-2 bg-white/5 text-slate-600 hover:bg-rose-500/15 hover:text-rose-400 rounded-xl transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Formulario crear/editar */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]" />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-black text-white">{editing ? 'Editar' : 'Nueva'} factura recurrente</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all"><X size={14} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <Field label="Nombre de la plantilla" value={form.name} onChange={v => setForm(f => ({...f, name: v}))} placeholder="Ej. Mantenimiento web mensual" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre del cliente" value={form.client_name} onChange={v => setForm(f => ({...f, client_name: v}))} placeholder="Empresa S.L." />
                    <Field label="Email del cliente" value={form.client_email} onChange={v => setForm(f => ({...f, client_email: v}))} placeholder="cliente@empresa.com" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Frecuencia</label>
                      <select value={form.frequency} onChange={e => setForm(f => ({...f, frequency: e.target.value}))}
                        className="w-full mt-1 px-3 py-2.5 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none">
                        <option value="weekly">Semanal</option>
                        <option value="monthly">Mensual</option>
                        <option value="quarterly">Trimestral</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">IVA %</label>
                      <input type="number" value={form.iva_rate} onChange={e => setForm(f => ({...f, iva_rate: Number(e.target.value)}))}
                        className="w-full mt-1 px-3 py-2.5 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">IRPF %</label>
                      <input type="number" value={form.irpf_rate} onChange={e => setForm(f => ({...f, irpf_rate: Number(e.target.value)}))}
                        className="w-full mt-1 px-3 py-2.5 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Primera generación</label>
                    <input type="date" value={form.next_date} onChange={e => setForm(f => ({...f, next_date: e.target.value}))}
                      className="w-full mt-1 px-3 py-2.5 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none" />
                  </div>

                  {/* Conceptos */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Conceptos</label>
                      <button onClick={() => setForm(f => ({...f, items: [...f.items, { concept: '', quantity: 1, price: 0, total: 0 }]}))}
                        className="text-[9px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-widest">+ Añadir</button>
                    </div>
                    <div className="space-y-2">
                      {form.items.map((item, i) => (
                        <div key={i} className="grid grid-cols-[1fr_60px_80px_auto] gap-2 items-center">
                          <input value={item.concept} onChange={e => updateItem(i, 'concept', e.target.value)} placeholder="Concepto"
                            className="px-3 py-2 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none placeholder:text-slate-600" />
                          <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} placeholder="Cant."
                            className="px-3 py-2 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none text-center" />
                          <input type="number" value={item.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} placeholder="€"
                            className="px-3 py-2 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none text-right" />
                          {form.items.length > 1 && (
                            <button onClick={() => setForm(f => ({...f, items: f.items.filter((_, j) => j !== i)}))} className="text-slate-600 hover:text-rose-400 transition-all">
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.client_name.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all">
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={13} />}
                    {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear plantilla'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-1 px-3 py-2.5 bg-white/5 border border-white/8 rounded-xl text-[11px] font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500/30 transition-all placeholder:text-slate-600" />
    </div>
  );
}

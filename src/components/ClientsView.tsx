import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Search, Pencil, Trash2, X, Check, Phone, Mail, MapPin, Hash, FileText } from 'lucide-react';
import { Client } from '../types';

const authFetch = (url: string, options?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
};

const EMPTY_CLIENT: Client = { name: '', nif: '', email: '', phone: '', address: '', city: '', province: '', zip: '', notes: '' };

export default function ClientsView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<Client>(EMPTY_CLIENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/clients${search.length >= 2 ? `?search=${encodeURIComponent(search)}` : ''}`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchClients, 300);
    return () => clearTimeout(timer);
  }, [fetchClients]);

  const openNew = () => {
    setEditingClient(null);
    setFormData(EMPTY_CLIENT);
    setError('');
    setShowForm(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({ ...client });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      const res = editingClient?.id
        ? await authFetch(`/api/clients/${editingClient.id}`, { method: 'PUT', body: JSON.stringify(formData) })
        : await authFetch('/api/clients', { method: 'POST', body: JSON.stringify(formData) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al guardar'); return; }
      setShowForm(false);
      fetchClients();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await authFetch(`/api/clients/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchClients();
  };

  const field = (label: string, key: keyof Client, placeholder: string, icon?: React.ReactNode, type = 'text') => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
        {icon} {label}
      </label>
      <input
        type={type}
        value={(formData[key] as string) || ''}
        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl outline-none focus:bg-white/8 focus:ring-1 focus:ring-purple-500/30 transition-all font-bold text-slate-200 placeholder:text-slate-700 text-[11px]"
      />
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
            <Users size={18} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tighter">Clientes</h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{clients.length} registrados</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={14} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, NIF o email..."
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/5 rounded-2xl outline-none focus:bg-white/8 focus:ring-1 focus:ring-purple-500/20 transition-all font-bold text-slate-200 placeholder:text-slate-600 text-sm"
        />
      </div>

      {/* Client List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-center">
            <Users size={28} className="text-slate-600" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-sm">{search ? 'Sin resultados' : 'Sin clientes aún'}</p>
            <p className="text-slate-600 text-[10px] font-bold mt-1">{search ? 'Prueba con otro término' : 'Crea tu primer cliente para autocompletar facturas'}</p>
          </div>
          {!search && (
            <button onClick={openNew} className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500/20 transition-all">
              + Añadir cliente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence>
            {clients.map(client => (
              <motion.div
                key={client.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white/3 border border-white/5 rounded-2xl p-4 space-y-2 hover:bg-white/5 hover:border-white/10 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-sm truncate">{client.name}</p>
                    {client.nif && <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest">{client.nif}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(client)} className="p-1.5 bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-300 text-slate-500 rounded-lg transition-all">
                      <Pencil size={12} />
                    </button>
                    {deleteConfirm === client.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(client.id!)} className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition-all">
                          <Check size={12} />
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="p-1.5 bg-white/5 text-slate-500 rounded-lg hover:bg-white/10 transition-all">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(client.id!)} className="p-1.5 bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-slate-500 rounded-lg transition-all">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {client.email && <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5"><Mail size={9} className="shrink-0" />{client.email}</p>}
                  {client.phone && <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5"><Phone size={9} className="shrink-0" />{client.phone}</p>}
                  {(client.city || client.address) && (
                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
                      <MapPin size={9} className="shrink-0" />
                      {[client.address, client.city, client.zip].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-white text-base">
                  {editingClient ? 'Editar cliente' : 'Nuevo cliente'}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field('Nombre / Razón Social *', 'name', 'Nombre del cliente', <Users size={9} />)}
                {field('NIF / CIF', 'nif', 'B12345678', <Hash size={9} />)}
                {field('Email', 'email', 'cliente@empresa.com', <Mail size={9} />, 'email')}
                {field('Teléfono', 'phone', '+34 600 000 000', <Phone size={9} />)}
                {field('Dirección', 'address', 'Calle y número', <MapPin size={9} />)}
                {field('Ciudad', 'city', 'Madrid', <MapPin size={9} />)}
                {field('Provincia', 'province', 'Madrid', <MapPin size={9} />)}
                {field('Código Postal', 'zip', '28001', <MapPin size={9} />)}
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  <FileText size={9} /> Notas internas
                </label>
                <textarea
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Condiciones especiales, persona de contacto..."
                  rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl outline-none focus:bg-white/8 focus:ring-1 focus:ring-purple-500/30 transition-all font-bold text-slate-200 placeholder:text-slate-700 text-[11px] resize-none"
                />
              </div>

              {error && (
                <p className="text-[10px] text-rose-400 font-black bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Check size={12} />}
                  {saving ? 'Guardando...' : 'Guardar cliente'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

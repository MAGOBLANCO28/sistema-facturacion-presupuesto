import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Trash2,
  Eye,
  Calendar,
  User,
  ChevronDown,
  ShieldCheck,
  Clock,
  RotateCcw,
  AlertTriangle,
  Receipt,
  Filter,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRightCircle,
  Pencil,
  XCircle,
  MinusCircle
} from 'lucide-react';
import { DocumentData, DocumentStatus } from '../types';
import Card from './common/Card';

interface Props {
  onEdit: (doc: DocumentData) => void;
  onPreview: (doc: DocumentData) => void;
  onRectify?: (doc: DocumentData) => void;
  onCreateAbono?: (doc: DocumentData) => void;
}

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

const formatEuro = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

const formatDate = (dateString: string) => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return dateString;
  }
};

const STATUS_CONFIG: Record<string, { label: string, color: string, bg: string }> = {
  'Borrador': { label: 'Borrador', color: 'text-slate-400', bg: 'bg-white/5 border-white/5' },
  'Emitida': { label: 'Emitida', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  'Pagada': { label: 'Pagada', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Rectificativa': { label: 'Rectificativa', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  'Cancelada': { label: 'Cancelada', color: 'text-slate-500', bg: 'bg-white/5 border-white/10' },
  'Pendiente': { label: 'Pendiente', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  'Definitivo': { label: 'Definitivo', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  'Aceptado': { label: 'Aceptado', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Rechazado': { label: 'Rechazado', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  'Convertido': { label: 'Convertido', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
};

export default function HistoryView({ onEdit, onPreview, onRectify, onCreateAbono }: Props) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [activeTab, setActiveTab] = useState<'invoices' | 'quotes'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { fetchDocuments(); }, []);

  const fetchDocuments = async () => {
    try {
      const res = await authFetch('/api/documents');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setDocuments([]);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/documents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: newStatus as any } : d));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleConvertToInvoice = async (doc: DocumentData) => {
    if (!confirm('¿Convertir este presupuesto en una factura emitida?')) return;
    try {
      // Marcar el presupuesto como Convertido en el servidor
      await handleStatusChange(doc.id!, 'Convertido');
      // Fetch siguiente número de factura
      const token = localStorage.getItem('token');
      const nextRes = await fetch('/api/next-number/invoice', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const nextData = await nextRes.json();
      const newInvoice: DocumentData = {
        ...doc,
        id: undefined,
        type: 'invoice' as any,
        number: nextData.number || '',
        status: 'Emitida' as any,
        date: new Date().toISOString().split('T')[0],
      };
      onEdit(newInvoice);
    } catch (err) {
      console.error('Error converting to invoice:', err);
    }
  };

  const handleCancelInvoice = async (doc: DocumentData) => {
    if (!confirm(`¿Cancelar la factura ${doc.number}? Se creará automáticamente un abono (nota de crédito).`)) return;
    try {
      const res = await authFetch(`/api/documents/cancel/${doc.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`Factura cancelada. Abono ${data.aboNumber} creado automáticamente.`);
        fetchDocuments();
      }
    } catch (err) {
      console.error('Error cancelling invoice:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este presupuesto?')) return;
    try {
      const res = await authFetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) fetchDocuments();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const isCorrectTab = activeTab === 'invoices' ? doc.type === 'invoice' : doc.type === 'quote';
    const matchesSearch =
      (doc.number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.client_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return isCorrectTab && matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h2 className="text-3xl font-black tracking-tighter text-white">Historial Fiscal</h2>
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2">Módulo de Inalterabilidad VeriFactu</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const token = localStorage.getItem('token');
              const res = await fetch('/api/export/incomes', { headers: { Authorization: `Bearer ${token}` } });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'libro_ingresos.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500/20 transition-all"
          >
            <Download size={13} /> Exportar CSV
          </button>
          <div className="flex glass p-1 rounded-2xl">
            <TabButton active={activeTab === 'invoices'} onClick={() => { setActiveTab('invoices'); setStatusFilter('all'); }} label="Facturas" icon={<ShieldCheck size={14} />} />
            <TabButton active={activeTab === 'quotes'} onClick={() => { setActiveTab('quotes'); setStatusFilter('all'); }} label="Presupuestos" icon={<FileText size={14} />} />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
         <div className="relative flex-1 group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-purple-400 transition-colors" size={16} />
            <input 
               type="text" 
               placeholder={`Buscar por cliente o número...`}
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl outline-none focus:ring-4 focus:ring-purple-500/10 transition-all font-bold text-sm text-slate-200 placeholder:text-slate-700 shadow-inner"
            />
         </div>
         <div className="relative w-full md:w-56">
            <select
               value={statusFilter}
               onChange={e => setStatusFilter(e.target.value)}
               className="w-full px-5 py-4 rounded-2xl outline-none font-black text-[10px] uppercase tracking-widest focus:ring-4 focus:ring-purple-500/10 transition-all shadow-inner appearance-none cursor-pointer"
               style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}
            >
               <option value="all" style={{ backgroundColor: '#1e293b', color: 'white' }}>Filtro Estado</option>
               {activeTab === 'invoices' ? (
                  <>
                     <option value="Emitida" style={{ backgroundColor: '#1e293b', color: 'white' }}>Emitida</option>
                     <option value="Pagada" style={{ backgroundColor: '#1e293b', color: 'white' }}>Pagada</option>
                     <option value="Cancelada" style={{ backgroundColor: '#1e293b', color: 'white' }}>Cancelada</option>
                  </>
               ) : (
                  <>
                     <option value="Borrador" style={{ backgroundColor: '#1e293b', color: 'white' }}>Borrador</option>
                     <option value="Definitivo" style={{ backgroundColor: '#1e293b', color: 'white' }}>Definitivo</option>
                     <option value="Aceptado" style={{ backgroundColor: '#1e293b', color: 'white' }}>Aceptado</option>
                     <option value="Rechazado" style={{ backgroundColor: '#1e293b', color: 'white' }}>Rechazado</option>
                     <option value="Convertido" style={{ backgroundColor: '#1e293b', color: 'white' }}>Convertido</option>
                  </>
               )}
            </select>
            <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600" />
         </div>
      </div>

      <div className="space-y-4 pb-12">
         {filteredDocs.length > 0 ? (
            filteredDocs.map(doc => (
               <div key={doc.id} className="group relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-[2.5rem] blur opacity-0 group-hover:opacity-100 transition duration-500" />
                  <div className="relative glass rounded-[2rem] p-5 flex items-center gap-6 group hover:translate-x-1 transition-all duration-300">
                     <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-white shadow-2xl border border-white/10 ${doc.type === 'invoice' ? (doc.is_rectificative ? 'bg-rose-500/20 text-rose-400 border-rose-500/20' : 'bg-blue-500/20 text-blue-400 border-blue-500/20') : 'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
                       {doc.type === 'invoice' ? (doc.is_rectificative ? <RotateCcw size={28} /> : <ShieldCheck size={28} />) : <FileText size={28} />}
                     </div>

                     <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-black text-white text-xl tracking-tighter tabular-nums">{doc.number}</span>
                          {doc.is_rectificative && <span className="bg-rose-500/10 text-rose-400 text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border border-rose-500/20 tracking-widest shadow-lg">Abono</span>}
                        </div>
                        <div className="flex items-center gap-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <span className="flex items-center gap-2 truncate"><User size={12} className="text-slate-600" /> {doc.client_name}</span>
                          <span className="flex items-center gap-2 whitespace-nowrap"><Calendar size={12} className="text-slate-600" /> {formatDate(doc.date)}</span>
                        </div>
                     </div>

                     <div className="flex flex-col items-end gap-2 px-6 border-r border-white/5">
                        <div className="relative">
                          <select
                            value={doc.status}
                            onChange={(e) => handleStatusChange(doc.id!, e.target.value)}
                            className={`appearance-none pl-4 pr-8 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border outline-none cursor-pointer transition-all shadow-lg ${STATUS_CONFIG[doc.status]?.bg || 'bg-white/5'} ${STATUS_CONFIG[doc.status]?.color || 'text-slate-400'}`}
                            style={{ backgroundColor: undefined }}
                          >
                            {doc.type === 'invoice' ? (
                              <>
                                <option value="Emitida" style={{ backgroundColor: '#1e293b', color: 'white' }}>Emitida</option>
                                <option value="Pagada" style={{ backgroundColor: '#1e293b', color: 'white' }}>Pagada</option>
                                <option value="Cancelada" style={{ backgroundColor: '#1e293b', color: 'white' }}>Cancelada</option>
                              </>
                            ) : (
                              <>
                                <option value="Borrador" style={{ backgroundColor: '#1e293b', color: 'white' }}>Borrador</option>
                                <option value="Definitivo" style={{ backgroundColor: '#1e293b', color: 'white' }}>Definitivo</option>
                                <option value="Aceptado" style={{ backgroundColor: '#1e293b', color: 'white' }}>Aceptado</option>
                                <option value="Rechazado" style={{ backgroundColor: '#1e293b', color: 'white' }}>Rechazado</option>
                                <option value="Convertido" disabled style={{ backgroundColor: '#1e293b', color: 'white' }}>Convertido</option>
                              </>
                            )}
                          </select>
                          <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
                        </div>
                        <p className="text-2xl font-black text-white tracking-tighter tabular-nums">{formatEuro(doc.total || 0)}</p>
                     </div>

                     <div className="flex items-center gap-2">
                        <ActionButton icon={<Eye size={20} />} onClick={() => onPreview(doc)} title="Ver / Imprimir" />
                        {doc.type === 'invoice' && !doc.is_rectificative && doc.status !== 'Cancelada' ? (
                          <>
                            <ActionButton icon={<MinusCircle size={20} />} onClick={() => onCreateAbono?.(doc)} title="Abono Parcial" accent="amber" />
                            <ActionButton icon={<XCircle size={20} />} onClick={() => handleCancelInvoice(doc)} title="Cancelar (Abono Total)" accent="rose" />
                          </>
                        ) : doc.type === 'quote' && doc.status !== 'Convertido' ? (
                          <>
                            <ActionButton icon={<Pencil size={20} />} onClick={() => onEdit(doc)} title="Editar" />
                            <ActionButton icon={<ArrowRightCircle size={20} />} onClick={() => handleConvertToInvoice(doc)} title="Convertir a Factura" accent="green" />
                            <ActionButton icon={<Trash2 size={20} />} onClick={() => handleDelete(doc.id!)} title="Eliminar" danger />
                          </>
                        ) : null}
                     </div>
                  </div>
               </div>
            ))
         ) : (
            <EmptyState tab={activeTab} />
         )}
      </div>

    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
   return (
      <button 
        onClick={onClick}
        className={`flex items-center gap-3 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${active ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {icon} {label}
      </button>
   );
}

function ActionButton({ icon, onClick, title, danger, accent }: { icon: React.ReactNode, onClick: () => void, title: string, danger?: boolean, accent?: 'rose' | 'green' | 'amber' }) {
  const colors = danger ? "hover:bg-rose-500/10 text-slate-600 hover:text-rose-400" :
                 accent === 'rose'  ? "hover:bg-rose-500/10 text-slate-600 hover:text-rose-400" :
                 accent === 'green' ? "hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400" :
                 accent === 'amber' ? "hover:bg-amber-500/10 text-slate-600 hover:text-amber-400" :
                 "hover:bg-white/10 text-slate-600 hover:text-white";
  return (
    <button onClick={onClick} className={`p-3 rounded-xl transition-all ${colors} border border-transparent hover:border-white/5 shadow-2xl`} title={title}>
      {icon}
    </button>
  );
}

function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="glass rounded-[3rem] border border-dashed border-white/5 py-24 text-center">
      <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-800 border border-white/5 shadow-inner">
        <Clock size={32} />
      </div>
      <h3 className="text-xl font-black text-slate-400 uppercase tracking-tighter">Bóveda vacía</h3>
      <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em] mt-3 animate-pulse">Sincronización Deep Space Activa</p>
    </div>
  );
}

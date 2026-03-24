import { useState, useEffect } from 'react';
import { FileText, Search, Trash2, Eye, Calendar, User, Euro } from 'lucide-react';
import { DocumentData } from '../types';

const ACCENT = '#1e3a5f';

interface Props {
  onEdit: (doc: DocumentData) => void;
  onPreview: (doc: DocumentData) => void;
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
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateString));
  } catch {
    return dateString;
  }
};

export default function HistoryView({ onEdit, onPreview }: Props) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'invoice' | 'quote'>('all');

  useEffect(() => { fetchDocuments(); }, []);

  const fetchDocuments = async () => {
    try {
      const res = await authFetch('/api/documents');
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este documento?')) return;
    try {
      const res = await authFetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) fetchDocuments();
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch =
      (doc.number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.client_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  // Estadísticas rápidas
  const totalFacturas = documents.filter(d => d.type === 'invoice').length;
  const totalPresupuestos = documents.filter(d => d.type === 'quote').length;
  const totalFacturado = documents.filter(d => d.type === 'invoice').reduce((sum, d) => sum + (d.total || 0), 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Historial</h2>
          <p className="text-zinc-500 text-sm">Gestiona tus facturas y presupuestos</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl outline-none text-sm w-64 focus:border-zinc-400 transition-colors"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="px-4 py-2 bg-white border border-zinc-200 rounded-xl outline-none text-sm font-medium focus:border-zinc-400 transition-colors"
          >
            <option value="all">Todos</option>
            <option value="invoice">Facturas</option>
            <option value="quote">Presupuestos</option>
          </select>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Facturas</p>
          <p className="text-3xl font-black text-zinc-900">{totalFacturas}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Presupuestos</p>
          <p className="text-3xl font-black text-zinc-900">{totalPresupuestos}</p>
        </div>
        <div className="rounded-2xl p-5 shadow-sm text-white" style={{ backgroundColor: ACCENT }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-60">Total facturado</p>
          <p className="text-2xl font-black">{formatEuro(totalFacturado)}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filteredDocs.length > 0 ? (
          filteredDocs.map(doc => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-all group overflow-hidden"
            >
              <div className="flex items-center p-5 gap-4">

                {/* Icono tipo */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                  style={{ backgroundColor: doc.type === 'invoice' ? ACCENT : '#64748b' }}
                >
                  <FileText size={20} />
                </div>

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-zinc-900 text-base">
                      {doc.number || <span className="text-zinc-300 font-normal italic text-sm">Sin número</span>}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: doc.type === 'invoice' ? ACCENT : '#64748b' }}
                    >
                      {doc.type === 'invoice' ? 'Factura' : 'Presupuesto'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <User size={13} />
                      {doc.client_name || <span className="italic text-zinc-300">Sin cliente</span>}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={13} />
                      {formatDate(doc.date)}
                    </span>
                  </div>
                </div>

                {/* Total */}
                <div className="text-right mr-4">
                  <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-0.5">Total</p>
                  <p className="text-xl font-black text-zinc-900">{formatEuro(doc.total || 0)}</p>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onPreview(doc)}
                    className="p-2.5 text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
                    title="Ver / Imprimir"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => onEdit(doc)}
                    className="p-2.5 text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
                    title="Editar"
                  >
                    <FileText size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id!)}
                    className="p-2.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white border border-dashed border-zinc-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#f0f4f8' }}>
              <FileText size={28} style={{ color: ACCENT }} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 mb-1">No hay documentos</h3>
            <p className="text-zinc-400 text-sm">Crea tu primera factura o presupuesto desde el menú lateral</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { FileText, Search, Trash2, Eye, Calendar, User, Euro } from 'lucide-react';
import { DocumentData } from '../types';

interface Props {
  onEdit: (doc: DocumentData) => void;
  onPreview: (doc: DocumentData) => void;
}

export default function HistoryView({ onEdit, onPreview }: Props) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'invoice' | 'quote'>('all');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este documento?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = 
      doc.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Historial</h2>
          <p className="text-zinc-500 text-sm">Gestiona tus facturas y presupuestos anteriores</p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all w-64 text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="px-4 py-2 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm font-medium"
          >
            <option value="all">Todos</option>
            <option value="invoice">Facturas</option>
            <option value="quote">Presupuestos</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredDocs.length > 0 ? (
          filteredDocs.map(doc => (
            <div 
              key={doc.id} 
              className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    doc.type === 'invoice' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    <FileText size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{doc.number}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        doc.type === 'invoice' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {doc.type === 'invoice' ? 'Factura' : 'Presupuesto'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                      <span className="flex items-center gap-1.5"><User size={14} /> {doc.client_name}</span>
                      <span className="flex items-center gap-1.5"><Calendar size={14} /> {doc.date}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Total</p>
                    <p className="text-xl font-black text-zinc-900">{doc.total.toFixed(2)} €</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPreview(doc)}
                      className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
                      title="Ver / Imprimir"
                    >
                      <Eye size={20} />
                    </button>
                    <button
                      onClick={() => onEdit(doc)}
                      className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
                      title="Editar"
                    >
                      <FileText size={20} />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id!)}
                      className="p-2.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Eliminar"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white border border-dashed border-zinc-300 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">No se encontraron documentos</h3>
            <p className="text-zinc-500 mt-1">Empieza creando una nueva factura o presupuesto</p>
          </div>
        )}
      </div>
    </div>
  );
}

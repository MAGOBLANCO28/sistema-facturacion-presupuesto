import React, { useState, useEffect } from 'react';
import { DocumentData } from '../types';
import { Eye, PlusCircle, MinusCircle, Receipt } from 'lucide-react';

interface Props {
  onPreview: (doc: DocumentData) => void;
  onCreateNew: () => void;
}

const authFetch = (path: string, opts?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

export default function AbonosView({ onPreview, onCreateNew }: Props) {
  const [abonos, setAbonos] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAbonos = async () => {
    try {
      const res = await authFetch('/api/documents?type=abono');
      const data = await res.json();
      setAbonos(Array.isArray(data) ? data : []);
    } catch {
      setAbonos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAbonos(); }, []);

  const totalAbonado = abonos.reduce((sum, d) => sum + Math.abs(d.total), 0);

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-1">Créditos emitidos</span>
          <h2 className="text-3xl font-black text-white tracking-tighter">Abonos</h2>
        </div>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 transition-all"
        >
          <PlusCircle size={16} /> Nuevo Abono
        </button>
      </div>

      {/* Stat */}
      {abonos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total abonos</p>
            <p className="text-2xl font-black text-red-400 tabular-nums">{abonos.length}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Importe total abonado</p>
            <p className="text-2xl font-black text-red-400 tabular-nums">-{fmt(totalAbonado)}</p>
          </div>
        </div>
      )}

      {/* Aviso VeriFactu */}
      <div className="flex items-center gap-3 px-5 py-3 bg-red-500/5 border border-red-500/20 rounded-2xl mb-6">
        <Receipt size={14} className="text-red-400 shrink-0" />
        <p className="text-[10px] font-bold text-red-400/80">
          Los abonos no pueden modificarse ni eliminarse una vez emitidos · Ley 11/2021 VeriFactu
        </p>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-20 text-slate-500">Cargando abonos...</div>
      ) : abonos.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <MinusCircle size={28} className="text-slate-600" />
          </div>
          <p className="text-slate-400 font-black text-lg mb-1">Sin abonos</p>
          <p className="text-slate-600 text-xs max-w-xs mx-auto">
            Los abonos aparecen aquí cuando cancelas una factura o creas uno manualmente desde el Historial.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {abonos.map(doc => (
            <div
              key={doc.id}
              className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between hover:bg-white/[0.07] transition-all group"
            >
              <div className="flex items-center gap-5">
                {/* Icono */}
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
                  <MinusCircle size={18} className="text-red-400" />
                </div>

                {/* Info */}
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-black text-white">{doc.number}</span>
                    {(doc as any).original_invoice_number && (
                      <span className="text-[9px] font-black text-red-400/70 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Cancela {(doc as any).original_invoice_number}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">{doc.client_name}</span>
                    <span className="text-slate-600 mx-2">·</span>
                    {doc.date}
                  </p>
                </div>
              </div>

              {/* Importe + acción */}
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-lg font-black text-red-400 tabular-nums">
                    -{fmt(Math.abs(doc.total))}
                  </p>
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Emitido</p>
                </div>
                <button
                  onClick={() => onPreview(doc)}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                  title="Vista previa"
                >
                  <Eye size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

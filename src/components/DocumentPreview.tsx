import React from 'react';
import { DocumentData, CompanySettings } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Printer, FileDown } from 'lucide-react';

interface Props {
  doc: DocumentData;
  settings: CompanySettings | null;
  onConvert?: () => void;
}

export default function DocumentPreview({ doc, settings, onConvert }: Props) {
  const isBudget = doc.type === 'quote';
  const isAbono  = doc.type === 'abono';

  const themeColor  = isBudget ? '#d97706' : isAbono ? '#dc2626' : '#7c3aed';
  const themeBg     = isBudget ? '#fffbeb' : isAbono ? '#fef2f2' : '#f5f3ff';
  const themeBorder = isBudget ? '#fde68a' : isAbono ? '#fecaca' : '#ddd6fe';

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

  const docTitle   = isBudget ? 'PRESUPUESTO' : isAbono ? 'NOTA DE CRÉDITO' : 'FACTURA';
  const irpfRate   = doc.irpf_rate || 0;
  const irpfAmount = Math.abs(doc.irpf_amount || 0);
  const hasIrpf    = irpfRate > 0 && irpfAmount > 0;
  const totalBruto = Math.abs(doc.total);
  const aCobrar    = hasIrpf ? totalBruto - irpfAmount : totalBruto;

  return (
    <div className="space-y-8 pb-12">
      {/* Barra de acciones */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-1">Previsualización</span>
          <h3 className="text-xl font-black text-white tracking-tighter">Documento {doc.number}</h3>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-4 bg-white/5 border border-white/5 rounded-2xl text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all">
            <Printer size={16} /> Imprimir
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl">
            <FileDown size={16} /> Descargar PDF
          </button>
        </div>
      </div>

      {/* CSS impresión */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page { margin: 1.2cm; size: A4 portrait; }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
          .print\\:hidden { display: none !important; }

          /* Documento: sin sombra, sin overflow:hidden (overflow:hidden rompe saltos de página) */
          .invoice-doc {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            overflow: visible !important;
          }

          /* Cabecera compacta */
          .inv-header { padding: 20px 32px !important; }

          /* Contenido: flex column con altura mínima para llenar la página */
          /* El inv-spacer crece para empujar el footer hacia abajo */
          .inv-content {
            padding: 20px 32px 24px !important;
            min-height: 200mm !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* Sección cliente */
          .inv-client { margin-bottom: 20px !important; }

          /* Tabla */
          .inv-table { margin-bottom: 16px !important; }
          .inv-table thead th { padding-bottom: 8px !important; font-size: 8px !important; }
          .inv-table tbody td { padding-top: 7px !important; padding-bottom: 7px !important; font-size: 12px !important; }

          /* Espaciador: crece para empujar footer abajo (con pocos conceptos) */
          .inv-spacer { flex: 1 !important; min-height: 8px !important; }

          /* Footer layout con CSS table */
          .inv-footer { padding-top: 16px !important; }
          .inv-footer-table { display: table !important; width: 100% !important; page-break-inside: avoid !important; break-inside: avoid !important; }
          .inv-footer-left  { display: table-cell !important; vertical-align: bottom !important; width: 50% !important; padding-right: 16px !important; }
          .inv-footer-right { display: table-cell !important; vertical-align: bottom !important; width: 50% !important; text-align: right !important; }
        }
      `}} />

      {/* Documento */}
      <div className="invoice-doc bg-white rounded-[2rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.35)] max-w-3xl mx-auto overflow-hidden border border-slate-100">

        {/* Cabecera */}
        <div className="inv-header px-12 py-10 flex justify-between items-start border-b border-slate-100" style={{ backgroundColor: themeBg }}>
          <div className="flex items-center gap-6">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-20 h-20 object-contain rounded-2xl bg-white p-2 shadow border border-slate-100" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black" style={{ backgroundColor: themeColor }}>
                {settings?.company_name?.[0] || 'F'}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: themeColor }}>{docTitle}</h1>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500">{doc.number}</span>
                <span className="text-xs text-slate-400 font-semibold">{doc.date}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-800 mb-1">{settings?.company_name}</p>
            <p className="text-xs text-slate-500 font-semibold">NIF/CIF: {settings?.cif}</p>
            {settings?.address  && <p className="text-xs text-slate-400">{settings.address}</p>}
            <p className="text-xs text-slate-400">{settings?.zip} {settings?.city}</p>
            {settings?.province && <p className="text-xs text-slate-400">{settings.province}</p>}
            {settings?.email    && <p className="text-xs text-slate-500 font-semibold mt-1">{settings.email}</p>}
          </div>
        </div>

        {/* Contenido */}
        <div className="inv-content px-12 py-8">

          {/* Receptor + estado */}
          <div className="inv-client grid grid-cols-2 gap-10 mb-8">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Facturado a</p>
              <div className="border-l-2 pl-4" style={{ borderColor: themeColor }}>
                <p className="text-sm font-bold text-slate-800 mb-0.5">{doc.client_name}</p>
                {doc.client_dni     && <p className="text-xs text-slate-500 font-semibold">NIF/CIF: {doc.client_dni}</p>}
                {doc.client_address && <p className="text-xs text-slate-400">{doc.client_address}</p>}
                {(doc.client_zip || doc.client_city) && (
                  <p className="text-xs text-slate-400">{doc.client_zip} {doc.client_city}</p>
                )}
                {doc.client_province && <p className="text-xs text-slate-400">{doc.client_province}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="w-48 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</span>
                  <span className="text-xs font-bold text-slate-700">{doc.date}</span>
                </div>
                {(doc as any).fecha_vencimiento && (
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vencimiento</span>
                    <span className="text-xs font-bold text-slate-700">{(doc as any).fecha_vencimiento}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado</span>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                    doc.status === 'Pagada' || doc.status === 'Aceptado' ? 'bg-emerald-100 text-emerald-700' :
                    doc.status === 'Cancelada' || doc.status === 'Rechazado' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{doc.status}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla conceptos */}
          <table className="inv-table w-full text-left border-collapse mb-6">
            <thead>
              <tr style={{ borderBottom: `2px solid ${themeColor}` }}>
                <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center w-16">Cant.</th>
                <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-32">Importe</th>
              </tr>
            </thead>
            <tbody>
              {(doc.items || []).map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? 'transparent' : '#f8fafc' }}>
                  <td className="py-3 pr-4 text-sm text-slate-700">{item.concept}</td>
                  <td className="py-3 text-center text-sm text-slate-400">{item.quantity}</td>
                  <td className="py-3 text-right text-sm font-bold text-slate-800 tabular-nums">
                    {isAbono ? `-${fmt(Math.abs(item.total))}` : fmt(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Espaciador: en pantalla da separación visual; en print crece para bajar el footer */}
          <div className="inv-spacer" style={{ minHeight: '32px' }} />

          {/* Footer: QR (izq) + Totales (der) */}
          <div className="inv-footer inv-footer-table pt-5 border-t border-slate-100" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>

            {/* Izquierda */}
            <div className="inv-footer-left" style={{ flex: 1 }}>
              {!isBudget && !isAbono ? (
                <div className="flex items-end gap-4">
                  <div style={{ padding: '10px', background: 'white', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', flexShrink: 0 }}>
                    <QRCodeSVG value={`faktio:2026:${doc.number}:${doc.total}`} size={60} level="H" />
                  </div>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                      ✓ Ley 11/2021 VeriFactu
                    </div>
                    <p className="text-[9px] text-slate-400">Ref: {doc.number.split('-').pop()} · {doc.date}</p>
                  </div>
                </div>
              ) : isBudget ? (
                <div style={{ padding: '12px', background: themeBg, border: `1px solid ${themeBorder}`, borderRadius: '10px', maxWidth: '240px' }}>
                  <p style={{ fontSize: '9px', color: themeColor, margin: 0, lineHeight: 1.5 }}>
                    Presupuesto sin validez tributaria hasta su conversión en factura legal.
                  </p>
                </div>
              ) : (
                <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', maxWidth: '240px' }}>
                  <p style={{ fontSize: '9px', color: '#b91c1c', margin: 0, lineHeight: 1.5 }}>
                    Nota de crédito que cancela la factura original.
                  </p>
                </div>
              )}
            </div>

            {/* Derecha: tarjeta totales */}
            <div className="inv-footer-right" style={{ flexShrink: 0, width: '272px' }}>
              <div style={{ border: `1px solid ${themeBorder}`, borderRadius: '12px', overflow: 'hidden', width: '272px' }}>
                <div style={{ backgroundColor: themeBg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                    <span>Base imponible</span>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{fmt(doc.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                    <span>IVA ({doc.iva_rate}%)</span>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{fmt(doc.iva_amount)}</span>
                  </div>
                  {hasIrpf && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', fontSize: '12px', background: '#fffbeb', color: '#92400e', borderBottom: '1px solid #fde68a', fontWeight: 600 }}>
                      <span>Ret. IRPF ({irpfRate}%)</span>
                      <span>-{fmt(irpfAmount)}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', backgroundColor: themeBg, borderTop: `2px solid ${themeColor}50` }}>
                  <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: themeColor }}>
                    {hasIrpf ? 'A COBRAR' : 'TOTAL'}
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: themeColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                    {fmt(aCobrar)}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Pie oculto en impresión */}
        <div className="px-12 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Zap size={13} fill="white" />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Faktio 2026 · Ley General Tributaria</p>
          </div>
          {isBudget && doc.status !== 'Convertido' && onConvert && (
            <button onClick={onConvert} className="px-6 py-3 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95" style={{ backgroundColor: themeColor }}>
              Convertir en Factura Legal
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

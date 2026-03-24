import React from 'react';
import { Printer } from 'lucide-react';
import { DocumentData, CompanySettings } from '../types';

const formatEuro = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    useGrouping: true
  }).format(amount);
};

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

interface Props {
  doc: DocumentData;
  settings: CompanySettings | null;
}

const ACCENT = '#1e3a5f';

export default function DocumentPreview({ doc, settings }: Props) {
  if (!settings) return null;

  return (
    <div className="min-h-screen bg-zinc-200 py-10 print:p-0 print:bg-white">

      <div className="flex justify-end max-w-[210mm] mx-auto px-4 mb-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2 text-white rounded-lg transition-colors shadow-lg font-bold"
          style={{ backgroundColor: ACCENT }}
        >
          <Printer size={18} />
          Imprimir Documento
        </button>
      </div>

      <div
        id="printable-document"
        className="bg-white shadow-2xl mx-auto print:shadow-none"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '0 15mm 20mm 15mm',
          color: '#18181B',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          display: 'block',
        }}
      >
        <div className="pt-[20mm]">
          <div className="flex justify-between items-start mb-10 pb-8" style={{ borderBottom: `4px solid ${ACCENT}` }}>
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <svg viewBox="0 0 100 100" className="w-full h-full" fill={ACCENT}>
                    <path d="M35 35 L35 80 L55 80 L55 20 L45 20 L45 50 L35 50 Z" />
                    <rect x="60" y="20" width="25" height="5" />
                    <rect x="65" y="35" width="20" height="5" />
                    <rect x="70" y="50" width="15" height="30" />
                  </svg>
                )}
              </div>
              <div>
                {settings.company_name && (
                  <h1 className="text-4xl font-black tracking-tighter leading-none uppercase" style={{ color: ACCENT }}>
                    {settings.company_name}
                  </h1>
                )}
                <div className="text-[11px] leading-tight space-y-1 text-zinc-600 mt-2">
                  <p className="font-bold text-zinc-900">{settings.owner_name}</p>
                  <p>CIF: {settings.cif} | {settings.address}</p>
                  <p>{settings.city}{settings.province ? ` (${settings.province})` : ''}</p>
                  <p className="font-semibold text-zinc-800">Tlf: {settings.phone} | {settings.email}</p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-white p-5 rounded-2xl inline-block text-left min-w-[180px]" style={{ backgroundColor: ACCENT }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#93b4d4' }}>
                  {doc.type === 'invoice' ? 'Factura Nº' : 'Presupuesto Nº'}
                </p>
                <p className="text-2xl font-black leading-none mb-3">{doc.number}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#93b4d4' }}>Fecha</p>
                <p className="text-base font-bold">{formatDate(doc.date)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-10 bg-zinc-50 p-6 rounded-2xl border border-zinc-100 print:break-inside-avoid">
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">Cliente</p>
              <p className="text-sm font-black text-zinc-900">{doc.client_name}</p>
              <p className="text-xs text-zinc-600 mt-1">{doc.client_address}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">DNI / CIF</p>
              <p className="text-sm font-black text-zinc-900">{doc.client_dni}</p>
              <p className="text-xs text-zinc-600 mt-1">{doc.client_city}</p>
            </div>
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr style={{ height: '20mm' }} className="print:table-row hidden">
              <td colSpan={3}></td>
            </tr>
            <tr className="text-white" style={{ backgroundColor: ACCENT }}>
              <th className="py-3 px-5 text-left font-bold uppercase text-[10px] tracking-widest rounded-l-xl border-none">Concepto</th>
              <th className="py-3 px-4 text-center font-bold uppercase text-[10px] tracking-widest w-20 border-none">Cant.</th>
              <th className="py-3 px-5 text-right font-bold uppercase text-[10px] tracking-widest w-32 rounded-r-xl border-none">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {doc.items.map((item, i) => (
              <tr key={i} className="print:break-inside-avoid">
                <td className="py-4 px-5 text-[12px] text-zinc-800 leading-relaxed font-medium align-top border-none">{item.concept}</td>
                <td className="py-4 px-4 text-center text-[12px] font-bold text-zinc-500 align-top border-none">{item.quantity || '-'}</td>
                <td className="py-4 px-5 text-right text-[12px] font-black text-zinc-900 align-top border-none">{item.total ? formatEuro(item.total) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pt-8 border-t-2 border-zinc-100 print:break-inside-avoid">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between items-center px-4">
                <span className="text-[9px] font-bold uppercase text-zinc-400">Base Imponible</span>
                <span className="font-bold text-sm">{formatEuro(doc.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center px-4">
                <span className="text-[9px] font-bold uppercase text-zinc-400">IVA ({doc.iva_rate}%)</span>
                <span className="font-bold text-sm">{formatEuro(Number(doc.iva_amount) || 0)}</span>
              </div>
              <div className="flex justify-between items-center p-5 text-white rounded-2xl mt-4" style={{ backgroundColor: ACCENT }}>
                <span className="font-black uppercase text-[10px] tracking-widest">Total</span>
                <span className="text-2xl font-black">{formatEuro(doc.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">
            Gracias por su confianza
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page { size: A4; margin: 0 !important; }
            body * { visibility: hidden; }
            #printable-document, #printable-document * { visibility: visible; }
            #printable-document {
              position: absolute; left: 0; top: 0;
              width: 210mm !important; margin: 0 !important;
              padding: 0 15mm 20mm 15mm !important;
              box-shadow: none !important;
            }
            table { border-spacing: 0; width: 100%; border-collapse: collapse; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            .print\\:table-row { display: table-row !important; }
          }
        `
      }} />
    </div>
  );
}

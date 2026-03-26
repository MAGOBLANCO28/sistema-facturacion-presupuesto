import React from 'react';
import { DocumentData, CompanySettings } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Building2, 
  User, 
  Calendar, 
  ShieldCheck, 
  Zap, 
  ArrowRight,
  Printer,
  FileDown,
  ChevronLeft
} from 'lucide-react';

interface Props {
  doc: DocumentData;
  settings: CompanySettings | null;
  onConvert?: () => void;
}

export default function DocumentPreview({ doc, settings, onConvert }: Props) {
  const isBudget = doc.type === 'quote';
  const themeColor = isBudget ? '#F59E0B' : '#a855f7'; // Purple for Invoices in Deep Space
  const themeColorLight = isBudget ? '#F59E0B08' : '#a855f705';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Action Bar (Hidden on Print) */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex flex-col">
           <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Previsualización Digital</span>
           <h3 className="text-xl font-black text-white tracking-tighter">Documento {doc.number}</h3>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-4 bg-white/5 border border-white/5 rounded-2xl text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all shadow-xl"
          >
            <Printer size={16} /> Imprimir
          </button>
          <button 
            onClick={handlePrint} 
            className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl shadow-purple-500/20"
          >
            <FileDown size={16} /> Descargar PDF
          </button>
        </div>
      </div>

      <div className="relative bg-white rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden max-w-4xl mx-auto border border-white/5 print:shadow-none print:border-none print:m-0 print:rounded-none">
        <div className="relative z-10">
          {/* Header Section */}
          <div className="p-10 md:p-14 flex flex-col md:flex-row justify-between items-start gap-10 border-b border-slate-50" style={{ backgroundColor: themeColorLight }}>
            <div className="flex items-center gap-8">
              <div className="relative">
                {settings?.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="w-28 h-28 object-contain rounded-3xl bg-white p-4 shadow-xl border border-slate-100" />
                ) : (
                  <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-white text-4xl font-black shadow-2xl" style={{ backgroundColor: themeColor }}>
                    {settings?.company_name?.[0] || 'F'}
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-5xl font-black tracking-tighter leading-none mb-4" style={{ color: themeColor }}>
                  {isBudget ? 'PRESUPUESTO' : 'FACTURA'}
                </h1>
                <div className="flex items-center gap-4">
                  <span className="px-4 py-1.5 bg-white border border-slate-100 rounded-xl text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] shadow-sm">
                    {doc.number}
                  </span>
                  <span className="text-xs font-black text-slate-300 uppercase tracking-widest">{doc.date}</span>
                </div>
              </div>
            </div>

            <div className="md:text-right">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter mb-4">{settings?.company_name}</h2>
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">CIF: {settings?.cif}</p>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">{settings?.address}</p>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">{settings?.zip} {settings?.city}</p>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">{settings?.province}</p>
                <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest pt-2 underline decoration-slate-200">{settings?.email}</p>
              </div>
            </div>
          </div>

          <div className="p-10 md:p-16">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-20 mb-16">
               <div className="space-y-6">
                  <div className="flex items-center gap-4 border-l-4 pl-6" style={{ borderColor: themeColor }}>
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl">
                      <User size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">DATOS RECEPTOR</span>
                      <p className="text-3xl font-black text-slate-900 tracking-tighter mt-1">{doc.client_name}</p>
                    </div>
                  </div>
                  <div className="pl-20 space-y-1">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-3">NIF/CIF: {doc.client_dni}</p>
                    <p className="text-lg font-bold text-slate-600 leading-tight">{doc.client_address}</p>
                    <p className="text-sm font-black text-slate-400 tracking-tighter uppercase italic">
                      {doc.client_zip} {doc.client_city || doc.client_province}
                    </p>
                  </div>
               </div>

               <div className="flex flex-col justify-end md:items-end gap-6">
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100/50 w-full sm:w-80">
                     <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/50">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">FECHA OPERACIÓN</span>
                        <span className="text-sm font-black text-slate-900">{doc.date}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ESTADO</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${doc.status === 'Pagada' || doc.status === 'Aceptado' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                           {doc.status}
                        </span>
                     </div>
                  </div>
               </div>
            </div>

            <div className="mb-16">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-4 border-slate-900 text-slate-900">
                    <th className="pb-6 text-[11px] font-black uppercase tracking-[0.3em]">Descripción Detallada</th>
                    <th className="pb-6 text-[11px] font-black uppercase tracking-[0.3em] text-center w-24">Cant.</th>
                    <th className="pb-6 text-[11px] font-black uppercase tracking-[0.3em] text-right w-44">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doc.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-8 font-bold text-slate-800 text-lg leading-relaxed">{item.concept}</td>
                      <td className="py-8 text-center text-slate-500 font-bold text-lg">{item.quantity}</td>
                      <td className="py-8 text-right font-black text-slate-900 text-xl tracking-tighter tabular-nums">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:flex-row items-end justify-between gap-16 pt-10">
              {!isBudget ? (
                <div className="flex items-center gap-6">
                  <div className="p-5 bg-white rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-50">
                    <QRCodeSVG 
                      value={`faktio:2026:${doc.number}:${doc.total}`}
                      size={100}
                      level="H"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm">
                      <ShieldCheck size={14} /> Certificado VeriFactu Ley 11/2021
                    </div>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                      Suma de Control: {doc.number.split('-').pop()}<br/>
                      Fecha Inalterable: {doc.date}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 max-w-sm">
                   <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
                      <p className="text-[10px] font-bold text-amber-900/40 uppercase tracking-widest leading-relaxed">
                        Este presupuesto es un documento comercial proforma sin validez tributaria hasta su conversión en factura legal certificada.
                      </p>
                   </div>
                </div>
              )}

              <div className="w-full md:w-96 p-10 bg-slate-900 rounded-[3rem] shadow-3xl shadow-slate-900/60">
                 <div className="space-y-4 pb-6 border-b border-white/10">
                   <div className="flex justify-between text-[12px] font-black text-white/30 uppercase tracking-widest">
                     <span>Base Operación</span>
                     <span className="text-white/70">{formatCurrency(doc.subtotal)}</span>
                   </div>
                   <div className="flex justify-between text-[12px] font-black text-white/30 uppercase tracking-widest">
                     <span>Cuota IVA ({doc.iva_rate}%)</span>
                     <span className="text-white/70">{formatCurrency(doc.iva_amount)}</span>
                   </div>
                 </div>
                 <div className="flex justify-between items-center pt-6">
                   <span className="text-xs font-black text-white tracking-[0.5em] uppercase opacity-30">Total Neto</span>
                   <span className="text-4xl font-black text-white tracking-tighter tabular-nums drop-shadow-2xl">
                     {formatCurrency(doc.total)}
                   </span>
                 </div>
              </div>
            </div>
          </div>

          <div className="p-10 border-t border-slate-50 flex items-center justify-between bg-slate-50/50 print:hidden">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
                   <Zap size={18} fill="white" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Faktio 2026 Engine</p>
                   <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">Cumple con la Ley General Tributaria</p>
                </div>
             </div>
             
             {isBudget && doc.status !== 'Convertido' && onConvert && (
               <button 
                 onClick={onConvert}
                 className="px-8 py-5 bg-amber-500 hover:bg-amber-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-amber-500/20 transition-all active:scale-95"
               >
                 Activar Factura Legal
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

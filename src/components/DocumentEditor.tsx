import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, FileText } from 'lucide-react';
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

export default function DocumentEditor({ type, initialData, onSave, settings }: Props) {
  const [formData, setFormData] = useState<DocumentData>({
    type,
    number: '',
    date: new Date().toISOString().split('T')[0],
    client_name: '',
    client_dni: '',
    client_address: '',
    client_city: '',
    items: [{ id: Math.random().toString(36).substr(2, 9), concept: '', quantity: undefined as any, total: undefined as any }],
    subtotal: 0,
    iva_rate: 10,
    iva_amount: 0,
    total: 0,
  });

  const [manualSubtotal, setManualSubtotal] = useState<string | null>(null);
  const [manualTotal, setManualTotal] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData(prev => ({ ...prev, type }));
    }
  }, [initialData, type]);

  useEffect(() => {
    const calculatedSubtotal = formData.items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const subtotalToUse = manualSubtotal !== null && manualSubtotal !== '' ? Number(manualSubtotal) : calculatedSubtotal;
    const iva_amount = subtotalToUse * (formData.iva_rate / 100);
    const calculatedTotal = subtotalToUse + iva_amount;
    const totalToUse = manualTotal !== null && manualTotal !== '' ? Number(manualTotal) : calculatedTotal;
    setFormData(prev => ({
      ...prev,
      subtotal: subtotalToUse,
      iva_amount,
      total: totalToUse
    }));
  }, [formData.items, formData.iva_rate, manualSubtotal, manualTotal]);

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Math.random().toString(36).substr(2, 9), concept: '', quantity: undefined as any, total: undefined as any }]
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
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value === '' ? undefined : value } : item)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        onSave();
      }
    } catch (err) {
      console.error('Error saving document:', err);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden max-w-4xl mx-auto">
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white">
            <FileText size={16} />
          </div>
          <h2 className="text-base font-bold">
            {initialData ? 'Editar' : 'Nueva'} {type === 'invoice' ? 'Factura' : 'Presupuesto'}
          </h2>
        </div>
        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors font-medium shadow-sm text-sm"
        >
          <Save size={16} />
          Guardar {type === 'invoice' ? 'Factura' : 'Presupuesto'}
        </button>
      </div>

      <form className="p-6 space-y-6">
        {/* Header - Datos de la empresa */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start border-b pb-6 border-zinc-100">
          <div className="flex items-center gap-4">
            {/* Logo o icono genérico */}
            <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
              {settings?.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <svg viewBox="0 0 100 100" className="w-full h-full text-red-700" fill="currentColor">
                  <path d="M35 35 L35 80 L55 80 L55 20 L45 20 L45 50 L35 50 Z" />
                  <rect x="60" y="20" width="25" height="5" />
                  <rect x="65" y="35" width="20" height="5" />
                  <rect x="70" y="50" width="15" height="30" />
                </svg>
              )}
            </div>

            {settings?.owner_name ? (
              <div className="text-xs space-y-0.5 text-zinc-600">
                {settings.company_name && (
                  <p className="font-black text-red-700 text-sm tracking-widest uppercase">
                    {settings.company_name}
                  </p>
                )}
                <p className="font-bold text-zinc-900">{settings.owner_name}</p>
                <p>CIF: {settings.cif}</p>
                <p>{settings.address}</p>
                <p>{settings.city}{settings.province ? ` (${settings.province})` : ''}</p>
              </div>
            ) : (
              <div className="text-xs text-zinc-400 space-y-1">
                <p className="font-bold text-zinc-500">Configura los datos de tu empresa</p>
                <p>Ve a <span className="text-red-700 font-medium">Configuración</span> para añadir</p>
                <p>tu nombre, CIF y dirección.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Número</label>
              <input
                type="text"
                value={formData.number}
                onChange={e => setFormData({ ...formData, number: e.target.value })}
                className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded focus:ring-1 focus:ring-red-500 outline-none text-sm"
                placeholder="Ej: 2024-001"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Fecha</label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded focus:ring-1 focus:ring-red-500 outline-none text-sm"
                required
              />
            </div>
          </div>
        </div>

        {/* Datos del Cliente */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Datos del Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <div className="flex items-center border-b border-zinc-100 pb-1">
              <span className="text-[10px] font-bold text-zinc-400 w-24 uppercase">Don/Doña:</span>
              <input
                type="text"
                value={formData.client_name}
                onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
                placeholder="Nombre completo"
                required
              />
            </div>
            <div className="flex items-center border-b border-zinc-100 pb-1">
              <span className="text-[10px] font-bold text-zinc-400 w-24 uppercase">DNI / CIF:</span>
              <input
                type="text"
                value={formData.client_dni}
                onChange={e => setFormData({ ...formData, client_dni: e.target.value })}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
                placeholder="Identificación"
              />
            </div>
            <div className="flex items-center border-b border-zinc-100 pb-1">
              <span className="text-[10px] font-bold text-zinc-400 w-24 uppercase">Dirección:</span>
              <input
                type="text"
                value={formData.client_address}
                onChange={e => setFormData({ ...formData, client_address: e.target.value })}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
                placeholder="Calle, número..."
              />
            </div>
            <div className="flex items-center border-b border-zinc-100 pb-1">
              <span className="text-[10px] font-bold text-zinc-400 w-24 uppercase">Población:</span>
              <input
                type="text"
                value={formData.client_city}
                onChange={e => setFormData({ ...formData, client_city: e.target.value })}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
                placeholder="Ciudad"
              />
            </div>
          </div>
        </div>

        {/* Conceptos e Importes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Conceptos e Importes</h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1 text-[10px] font-black text-red-700 hover:text-red-800 uppercase"
            >
              <Plus size={12} />
              Añadir Línea
            </button>
          </div>

          <div className="border rounded-lg overflow-hidden border-zinc-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="py-2 px-4 text-[10px] font-bold text-zinc-400 uppercase">Concepto</th>
                  <th className="py-2 px-2 text-[10px] font-bold text-zinc-400 uppercase text-center w-20">Cant.</th>
                  <th className="py-2 px-4 text-[10px] font-bold text-zinc-400 uppercase text-right w-28">Total (€)</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {formData.items.map((item) => (
                  <tr key={item.id} className="group">
                    <td className="py-1 px-4">
                      <input
                        type="text"
                        value={item.concept}
                        onChange={e => handleItemChange(item.id, 'concept', e.target.value)}
                        className="w-full bg-transparent outline-none text-sm py-1"
                        placeholder="Descripción..."
                        required
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        value={item.quantity === undefined ? '' : item.quantity}
                        onChange={e => handleItemChange(item.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-transparent outline-none text-sm text-center py-1"
                      />
                    </td>
                    <td className="py-1 px-4">
                      <input
                        type="number"
                        step="0.01"
                        value={item.total === undefined ? '' : item.total}
                        onChange={e => handleItemChange(item.id, 'total', e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-transparent outline-none text-sm text-right py-1 font-medium"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1 text-zinc-200 hover:text-red-600 transition-colors"
                        disabled={formData.items.length === 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales */}
        <div className="flex justify-end pt-4 border-t border-zinc-100">
          <div className="w-64 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 font-bold uppercase text-[10px]">Subtotal</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={manualSubtotal !== null ? manualSubtotal : formData.subtotal.toFixed(2)}
                  onChange={e => setManualSubtotal(e.target.value)}
                  onBlur={() => { if (manualSubtotal === '') setManualSubtotal(null); }}
                  className="bg-transparent outline-none text-right font-bold w-24 focus:text-red-700"
                />
                <span className="text-zinc-400 font-bold">€</span>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 font-bold uppercase text-[10px]">IVA</span>
                <select
                  value={formData.iva_rate}
                  onChange={e => setFormData({ ...formData, iva_rate: Number(e.target.value) })}
                  className="px-1 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[10px] font-black outline-none"
                >
                  <option value={10}>10%</option>
                  <option value={21}>21%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
              <span className="font-bold text-zinc-600">{formatEuro(formData.iva_amount)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-200">
              <span className="text-xs font-black uppercase text-zinc-900 tracking-widest">Total</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={manualTotal !== null ? manualTotal : formData.total.toFixed(2)}
                  onChange={e => setManualTotal(e.target.value)}
                  onBlur={() => { if (manualTotal === '') setManualTotal(null); }}
                  className="bg-transparent outline-none text-right font-black text-lg text-red-700 w-32 focus:ring-1 focus:ring-red-100 rounded"
                />
                <span className="text-red-700 font-black text-lg">€</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

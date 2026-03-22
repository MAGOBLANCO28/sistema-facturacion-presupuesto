import React, { useState, useEffect } from 'react';
import { Save, Building2, User, CreditCard, Phone, Mail, MapPin } from 'lucide-react';
import { CompanySettings } from '../types';

interface Props {
  settings: CompanySettings | null;
  onUpdate: () => void;
}

export default function SettingsView({ settings, onUpdate }: Props) {
  const [formData, setFormData] = useState<CompanySettings>({
    company_name: '',
    owner_name: '',
    cif: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        onUpdate();
        alert('Configuración guardada correctamente');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Configuración</h2>
        <p className="text-zinc-500 text-sm">Edita los datos de tu empresa que aparecerán en los documentos</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Building2 size={16} /> Empresa
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">Nombre Comercial</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">Propietario</label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={e => setFormData({ ...formData, owner_name: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">CIF / NIF</label>
                <input
                  type="text"
                  value={formData.cif}
                  onChange={e => setFormData({ ...formData, cif: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Phone size={16} /> Contacto
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">Teléfono</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin size={16} /> Ubicación
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">Dirección</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600">Ciudad</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600">Provincia</label>
                  <input
                    type="text"
                    value={formData.province}
                    onChange={e => setFormData({ ...formData, province: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-8 py-3 bg-red-700 text-white rounded-xl hover:bg-red-800 transition-colors font-bold shadow-sm"
          >
            <Save size={20} />
            Guardar Cambios
          </button>
        </div>
      </form>
    </div>
  );
}

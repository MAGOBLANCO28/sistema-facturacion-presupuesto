import React, { useState, useEffect, useRef } from 'react';
import { Save, Building2, Phone, MapPin, Upload, Trash2 } from 'lucide-react';
import { CompanySettings } from '../types';

interface Props {
  settings: CompanySettings | null;
  onUpdate: () => void;
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
    logo_url: '',
  });
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) setFormData(settings);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        onUpdate();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('logo', file);
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        onUpdate();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Error uploading logo:', err);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('¿Eliminar el logo?')) return;
    try {
      const res = await authFetch('/api/settings/logo', { method: 'DELETE' });
      if (res.ok) onUpdate();
    } catch (err) {
      console.error('Error deleting logo:', err);
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

          {/* LOGO */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Upload size={16} /> Logo de tu empresa
            </h3>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200 flex items-center justify-center overflow-hidden bg-zinc-50">
                {settings?.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <span className="text-xs text-zinc-400 text-center px-2">Sin logo</span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Upload size={16} />
                  {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
                </button>
                {settings?.logo_url && (
                  <button
                    type="button"
                    onClick={handleDeleteLogo}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                  >
                    <Trash2 size={16} />
                    Eliminar logo
                  </button>
                )}
                <p className="text-[10px] text-zinc-400">PNG, JPG, SVG o WEBP. Máximo 2MB.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Building2 size={16} /> Empresa
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">
                  Nombre Comercial
                  <span className="ml-2 text-[10px] text-zinc-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  placeholder="Ej: Mi Empresa S.L."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">Nombre del Autónomo / Propietario</label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={e => setFormData({ ...formData, owner_name: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  placeholder="Tu nombre completo"
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
                  placeholder="Ej: 12345678A"
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
                  placeholder="Ej: 600 000 000"
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
                  placeholder="tu@email.com"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin size={16} /> Ubicación
            </h3>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600">Dirección</label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                placeholder="Calle, número..."
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
                  placeholder="Ej: Madrid"
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
                  placeholder="Ej: Madrid"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
          {saved ? (
            <p className="text-sm text-green-600 font-medium">✓ Cambios guardados correctamente</p>
          ) : <div />}
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

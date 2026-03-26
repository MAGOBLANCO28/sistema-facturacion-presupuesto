import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Upload, 
  Lock, 
  Key,
  Mail,
  Phone as PhoneIcon,
  MapPin,
  ShieldCheck,
  Globe,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CompanySettings } from '../types';
import Card from './common/Card';

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
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
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
    zip: ''
  });
  
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);
  const [pinForSeed, setPinForSeed] = useState('');
  
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        zip: (settings as any).zip || ''
      });
    }
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

  const handleUpdatePin = async () => {
    setError('');
    if (newPin.length !== 4) return setError('El nuevo PIN debe tener 4 dígitos');
    try {
      const res = await authFetch('/api/auth/pin', {
        method: 'PATCH',
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (!res.ok) {
        const data = await res.json();
        return setError(data.error || 'Error al actualizar PIN');
      }
      setSaved(true);
      setCurrentPin('');
      setNewPin('');
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Error de conexión');
    }
  };

  const handleRevealSeed = async () => {
    setError('');
    try {
      const res = await authFetch('/api/auth/seed', {
        method: 'POST',
        body: JSON.stringify({ pin: pinForSeed }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'PIN incorrecto');
      setSeed(data.seed);
      setShowSeed(true);
    } catch {
      setError('Error de conexión');
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

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center justify-between mb-2 px-2">
        <h2 className="text-2xl font-black text-white tracking-tighter">Ajustes</h2>
        <div className="flex glass p-1 rounded-2xl">
           <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} label="Empresa" />
           <TabButton active={activeTab === 'security'} onClick={() => setActiveTab('security')} label="Seguridad" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'profile' ? (
          <form key="profile" onSubmit={handleSubmit} className="space-y-3">
            <Card className="p-3 flex flex-col items-center justify-center text-center gap-2">
              <label className="relative cursor-pointer group">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden border border-white/10 group-hover:border-purple-500/50 transition-all bg-slate-900 shadow-xl relative z-10">
                  {settings?.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 size={32} className="text-slate-600 group-hover:text-purple-400 group-hover:scale-110 transition-all duration-300" />
                  )}
                </div>

                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl z-20 backdrop-blur-sm">
                  <Upload size={20} className="text-white" />
                </div>
                {uploadingLogo && (
                  <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center rounded-2xl z-30 backdrop-blur-sm">
                    <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                  </div>
                )}
              </label>
              <div className="space-y-1">
                 <h3 className="font-black text-white text-sm">Logo de Empresa</h3>
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">PNG / JPG (Max 5MB)</p>
              </div>
            </Card>

            {/* Formulario */}
            <Card className="md:col-span-2 p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                 <InputField label="Nombre Empresa" value={formData.company_name} onChange={(e: any) => setFormData({...formData, company_name: e.target.value})} placeholder="Ej. ACME S.L." />
                 <InputField label="NIF / CIF" value={formData.cif} onChange={e => setFormData({...formData, cif: e.target.value})} placeholder="B12345678" />
                 <InputField label="Responsable" value={formData.owner_name} onChange={e => setFormData({...formData, owner_name: e.target.value})} placeholder="Nombre Completo" />
                 <InputField label="Email Fiscal" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="admin@factio.es" />
                 <InputField label="Teléfono" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+34 ..." />
                 <InputField label="Ciudad" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="Madrid" />
                 <InputField label="Dirección Postal" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Calle Falsa 123" />
                 <div className="grid grid-cols-2 gap-3">
                    <InputField label="Provincia" value={formData.province} onChange={(e: any) => setFormData({...formData, province: e.target.value})} placeholder="Madrid" />
                    <InputField label="C.P." value={formData.zip} onChange={(e: any) => setFormData({...formData, zip: e.target.value})} placeholder="28001" />
                 </div>
              </div>
            </Card>

            <div className="flex items-center justify-between px-2 pt-2">
               <div>{saved && <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest animate-pulse">✓ Guardado</span>}</div>
               <button type="submit" className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                 <CheckCircle2 size={14} /> Aplicar Cambios
               </button>
            </div>
          </form>
        ) : (
          <div key="security" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <Card className="p-4 space-y-4" accent="blue">
                  <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/20 shadow-lg"><Lock size={14} /></div>
                     <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Código PIN</h3>
                  </div>
                  <div className="space-y-3">
                     <PinInput label="PIN Actual" value={currentPin} onChange={setCurrentPin} />
                     <PinInput label="Nuevo PIN" value={newPin} onChange={setNewPin} />
                     <button onClick={handleUpdatePin} className="w-full py-2.5 mt-2 bg-white/5 text-white border border-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all shadow-xl">
                        Cambiar PIN
                     </button>
                  </div>
               </Card>

               <Card className="p-4 space-y-4 flex flex-col" accent="purple">
                  <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center border border-purple-500/20 shadow-lg"><Key size={14} /></div>
                     <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Semilla Maestra</h3>
                  </div>
                  {!showSeed ? (
                    <div className="flex-1 flex flex-col gap-3">
                       <PinInput label="Confirma PIN" value={pinForSeed} onChange={setPinForSeed} />
                       <button onClick={handleRevealSeed} className="w-full py-2.5 bg-purple-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-purple-600 transition-all shadow-lg mt-auto shadow-purple-500/20">
                          Revelar Frase
                       </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-4">
                       <div className="flex-1 p-4 bg-purple-500/5 rounded-2xl border border-purple-500/20 text-[10px] font-mono font-bold text-purple-200 break-words leading-relaxed overflow-auto max-h-[120px] shadow-inner custom-scrollbar">
                          {seed}
                       </div>
                       <button onClick={() => setShowSeed(false)} className="w-full py-3 bg-white/5 text-slate-400 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:text-white transition-colors">
                          Cerrar
                       </button>
                    </div>
                  )}
               </Card>
            </div>
            {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 font-black text-[10px] text-center uppercase tracking-widest">{error}</div>}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
   return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${active ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {label}
      </button>
   );
}

function CompactField({ label, value, onChange, icon, type = 'text', placeholder }: { label: string, value: string, onChange: (v: string) => void, icon?: React.ReactNode, type?: string, placeholder?: string }) {
   return (
      <div className="space-y-1.5">
         <label className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">
            {icon} {label}
         </label>
         <input
           type={type}
           value={value}
           onChange={e => onChange(e.target.value)}
           placeholder={placeholder}
           className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl outline-none focus:bg-white/10 focus:ring-1 focus:ring-purple-500/20 transition-all font-bold text-slate-200 placeholder:text-slate-800 text-[10px] shadow-inner"
         />
      </div>
   );
}

function InputField({ label, value, onChange, placeholder, type = 'text', prefix }: any) {
  return (
    <div className="space-y-1.5 px-1 relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly
          onFocus={e => e.target.removeAttribute('readOnly')}
          className={`w-full bg-slate-900 border border-white/5 py-1.5 rounded-xl font-bold text-slate-200 outline-none focus:border-purple-500/50 focus:bg-white/5 transition-all text-xs ${prefix ? 'pl-8' : 'px-3'}`}
        />
      </div>
    </div>
  );
}

function PinInput({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
   return (
      <div className="space-y-1.5">
         <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
         <input 
            type="password" maxLength={4}
            value={value} onChange={e => onChange(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl outline-none focus:bg-white/10 focus:ring-1 focus:ring-blue-500/20 transition-all text-center font-black tracking-[0.4em] text-white text-[10px] shadow-inner"
         />
      </div>
   );
}

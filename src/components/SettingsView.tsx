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
  CheckCircle2,
  FileText,
  ExternalLink,
  Copy,
  Trash2 as TrashIcon,
  Link,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CompanySettings } from '../types';
import Card from './common/Card';
import { usePlan, Plan, Feature } from '../context/PlanContext';
import UpgradeModal from './UpgradeModal';
import { PLAN_REQUIRED } from '../context/PlanContext';

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
  const { plan, canUse } = usePlan();
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'gestor' | 'plan'>('profile');

  // Abrir pestaña Plan desde UpgradeModal
  useEffect(() => {
    const handler = () => setActiveTab('plan');
    window.addEventListener('faktio:plans', handler);
    return () => window.removeEventListener('faktio:plans', handler);
  }, []);
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
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
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
        zip: (settings as any).zip || '',
        account_type: (settings as any).account_type || 'autonomo',
        irpf_rate: (settings as any).irpf_rate || 15,
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
    if (newPin.length !== 4) return setError('El nuevo PIN debe tener exactamente 4 dígitos');
    if (newPin !== confirmPin) return setError('Los PINs no coinciden. Verifica que has escrito el mismo PIN dos veces');
    try {
      const res = await authFetch('/api/auth/pin', {
        method: 'PATCH',
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (!res.ok) {
        const data = await res.json();
        return setError(data.error || 'Error al actualizar PIN');
      }
      setPinSuccess(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setTimeout(() => setPinSuccess(false), 4000);
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
           <TabButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} label="Alertas IA" />
           <TabButton active={activeTab === 'gestor'} onClick={() => setActiveTab('gestor')} label="Gestor" />
           <TabButton active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} label="Mi Plan" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'profile' ? (
          <form key="profile" onSubmit={handleSubmit} className="space-y-3">
            <Card className="p-3 flex flex-col items-center justify-center text-center gap-2">
              <label
                className="relative cursor-pointer group"
                onClick={e => { if (!canUse('logo')) { e.preventDefault(); setUpgradeModal(true); } }}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden border transition-all bg-slate-900 shadow-xl relative z-10 ${
                  canUse('logo') ? 'border-white/10 group-hover:border-purple-500/50' : 'border-amber-500/20'
                }`}>
                  {settings?.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                  ) : canUse('logo') ? (
                    <Building2 size={32} className="text-slate-600 group-hover:text-purple-400 group-hover:scale-110 transition-all duration-300" />
                  ) : (
                    <span className="text-2xl">🔒</span>
                  )}
                </div>

                {canUse('logo') && <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />}
                {canUse('logo') && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl z-20 backdrop-blur-sm">
                    <Upload size={20} className="text-white" />
                  </div>
                )}
                {uploadingLogo && (
                  <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center rounded-2xl z-30 backdrop-blur-sm">
                    <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                  </div>
                )}
              </label>
              <div className="space-y-1">
                 <h3 className="font-black text-white text-sm">Logo de Empresa</h3>
                 {canUse('logo')
                   ? <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">PNG / JPG (Max 5MB)</p>
                   : <p className="text-[10px] text-amber-500/70 font-bold">Requiere Plan Profesional</p>
                 }
              </div>
            </Card>

            <UpgradeModal
              open={upgradeModal}
              onClose={() => setUpgradeModal(false)}
              feature="logo"
              currentPlan={plan}
              requiredPlan={PLAN_REQUIRED['logo']}
            />

            {/* Formulario */}
            <Card className="md:col-span-2 p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                 <InputField label="Nombre Empresa" value={formData.company_name} onChange={(e: any) => setFormData({...formData, company_name: e.target.value})} placeholder="Ej. ACME S.L." />
                 <InputField label="NIF / CIF" value={formData.cif} onChange={e => setFormData({...formData, cif: e.target.value})} placeholder="B12345678" />
                 <InputField label="Responsable" value={formData.owner_name} onChange={e => setFormData({...formData, owner_name: e.target.value})} placeholder="Nombre Completo" />
                 <InputField label="Email Fiscal" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="admin@factio.es" />
                 <InputField label="Teléfono" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+34 ..." />
                 <InputField label="Página Web" value={(formData as any).website || ''} onChange={e => setFormData({...formData, website: e.target.value} as any)} placeholder="https://www.tuempresa.com" />
                 <InputField label="Ciudad" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="Madrid" />
                 <InputField label="Dirección Postal" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Calle Falsa 123" />
                 <div className="grid grid-cols-2 gap-3">
                    <InputField label="Provincia" value={formData.province} onChange={(e: any) => setFormData({...formData, province: e.target.value})} placeholder="Madrid" />
                    <InputField label="C.P." value={formData.zip} onChange={(e: any) => setFormData({...formData, zip: e.target.value})} placeholder="28001" />
                 </div>
              </div>

              {/* Tipo de Actividad */}
              <div className="pt-2 border-t border-white/5 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Actividad</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['autonomo', 'sl'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({...formData, account_type: type})}
                      className={`py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                        (formData as any).account_type === type
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                          : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {type === 'autonomo' ? 'Autónomo' : 'Sociedad Limitada (SL)'}
                    </button>
                  ))}
                </div>
                {(formData as any).account_type === 'autonomo' && (
                  <div className="space-y-1.5 px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retención IRPF en facturas</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[7, 15].map(rate => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setFormData({...formData, irpf_rate: rate} as any)}
                          className={`py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                            (formData as any).irpf_rate === rate
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                              : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {rate}% {rate === 7 ? '(nuevo autónomo)' : '(general)'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-600 font-bold px-1">7% si llevas menos de 3 años de alta · 15% general</p>
                  </div>
                )}
              </div>
            </Card>

            <div className="flex items-center justify-between px-2 pt-2">
               <div>{saved && <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest animate-pulse">✓ Guardado</span>}</div>
               <button type="submit" className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                 <CheckCircle2 size={14} /> Aplicar Cambios
               </button>
            </div>
          </form>
        ) : activeTab === 'security' ? (
          <div key="security" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* ── Código PIN ── */}
              <Card className="p-4 space-y-3" accent="blue">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/20"><Lock size={14} /></div>
                  <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Código PIN</h3>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <PinInput label="PIN Actual" value={currentPin} onChange={setCurrentPin} />
                    <p className="text-[8px] text-slate-600 font-bold mt-1 pl-1">Deja vacío si aún no tienes PIN configurado</p>
                  </div>
                  <PinInput label="Nuevo PIN (4 dígitos)" value={newPin} onChange={setNewPin} />
                  <PinInput label="Confirmar nuevo PIN" value={confirmPin} onChange={setConfirmPin} />
                  {pinSuccess && (
                    <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest text-center animate-pulse">
                      ✓ PIN guardado correctamente
                    </p>
                  )}
                  <button onClick={handleUpdatePin} className="w-full py-2.5 bg-blue-500/15 text-blue-300 border border-blue-500/20 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-500/25 transition-all">
                    Guardar PIN
                  </button>
                </div>
              </Card>

              {/* ── Palabras de Recuperación ── */}
              <Card className="p-4 space-y-3 flex flex-col" accent="purple">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center border border-purple-500/20"><Key size={14} /></div>
                  <div>
                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Palabras de Recuperación</h3>
                    <p className="text-[8px] text-slate-600 font-bold mt-0.5">12 palabras · protegidas por PIN</p>
                  </div>
                </div>
                {!showSeed ? (
                  <div className="flex-1 flex flex-col gap-3">
                    <PinInput label="Introduce tu PIN para revelar" value={pinForSeed} onChange={setPinForSeed} />
                    <button onClick={handleRevealSeed} className="w-full py-2.5 bg-purple-500/15 text-purple-300 border border-purple-500/20 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-purple-500/25 transition-all mt-auto">
                      Revelar palabras
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="grid grid-cols-4 gap-1.5">
                      {(seed || '').split(' ').map((word, i) => (
                        <div key={i} className="py-1.5 px-2 bg-purple-500/5 border border-purple-500/15 rounded-xl flex items-center gap-1 overflow-hidden">
                          <span className="text-[7px] text-purple-400/50 shrink-0">{i + 1}.</span>
                          <span className="text-[9px] font-mono font-bold text-purple-200 truncate">{word}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[8px] text-slate-600 font-bold text-center">Guárdalas en papel · no compartas estas palabras</p>
                    <button onClick={() => { setShowSeed(false); setPinForSeed(''); }} className="w-full py-2.5 bg-white/5 text-slate-400 rounded-xl font-black text-[9px] uppercase tracking-widest hover:text-white transition-colors">
                      Ocultar
                    </button>
                  </div>
                )}
              </Card>

            </div>
              {/* ── Legal y Privacidad ── */}
              <Card className="p-4 space-y-3" accent="none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-500/10 text-slate-400 rounded-xl flex items-center justify-center border border-slate-500/20"><FileText size={14} /></div>
                  <div>
                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Legal y Privacidad</h3>
                    <p className="text-[8px] text-slate-600 font-bold mt-0.5">RGPD · LOPDGDD · Ley de Trazabilidad</p>
                  </div>
                </div>
                <a
                  href="/politicas.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 hover:border-white/10 transition-all group"
                >
                  <span className="text-[10px] font-black text-slate-400 group-hover:text-white uppercase tracking-widest transition-colors">Política de Privacidad</span>
                  <ExternalLink size={12} className="text-slate-600 group-hover:text-purple-400 transition-colors" />
                </a>
                <div className="p-3 bg-white/3 border border-white/5 rounded-xl space-y-1">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Ejercer derechos ARCO</p>
                  <p className="text-[9px] text-slate-600 leading-relaxed">
                    Acceso, rectificación, cancelación u oposición · Escribe a{' '}
                    <span className="text-purple-400 font-bold">privacidad@faktio.app</span>
                  </p>
                </div>
              </Card>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 font-black text-[10px] text-center uppercase tracking-widest">
                {error}
              </div>
            )}
          </div>
        ) : activeTab === 'notifications' ? (
          <motion.div key="notifications" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            {/* Agente Cobros */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Mail size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">Agente IA — Recordatorio de Cobros</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Envía recordatorios automáticos a clientes con facturas pendientes</p>
                </div>
                <label className="ml-auto flex items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={(formData as any).recordatorios_cobros !== false}
                      onChange={e => setFormData({ ...formData, recordatorios_cobros: e.target.checked } as any)}
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${(formData as any).recordatorios_cobros !== false ? 'bg-blue-500' : 'bg-slate-700'}`} />
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(formData as any).recordatorios_cobros !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </label>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Días de aviso antes del vencimiento</label>
                <input
                  type="number"
                  min={1} max={30}
                  value={(formData as any).dias_aviso_cobro || 3}
                  onChange={e => setFormData({ ...formData, dias_aviso_cobro: parseInt(e.target.value) } as any)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl outline-none focus:bg-white/10 focus:ring-1 focus:ring-blue-500/30 transition-all font-bold text-slate-200 text-[10px]"
                />
                <p className="text-[8px] text-slate-600">El recordatorio se enviará este número de días antes del vencimiento de la factura</p>
              </div>
            </Card>

            {/* Agente Impuestos */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">Agente IA — Recordatorio de Impuestos</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Avisos automáticos 15 y 3 días antes de cada vencimiento fiscal</p>
                </div>
                <label className="ml-auto flex items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={(formData as any).recordatorios_impuestos !== false}
                      onChange={e => setFormData({ ...formData, recordatorios_impuestos: e.target.checked } as any)}
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${(formData as any).recordatorios_impuestos !== false ? 'bg-amber-500' : 'bg-slate-700'}`} />
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(formData as any).recordatorios_impuestos !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </label>
              </div>
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                {(formData as any).account_type === 'sl' ? (
                  <p className="text-[9px] text-amber-400/80 leading-relaxed">
                    📅 <strong>Modelo 303 (IVA trimestral):</strong> Avisos en abril, julio, octubre y enero<br />
                    🏢 <strong>Modelo 202 (IS pagos fraccionados):</strong> Avisos en abril, octubre y diciembre<br />
                    📋 <strong>Modelo 200 (Impuesto Sociedades anual):</strong> Aviso en julio<br />
                    📊 <strong>Modelo 390 (IVA anual):</strong> Aviso en enero
                  </p>
                ) : (
                  <p className="text-[9px] text-amber-400/80 leading-relaxed">
                    📅 <strong>Modelos 303 + 130 (IVA e IRPF trimestral):</strong> Avisos en abril, julio, octubre y enero<br />
                    📋 <strong>Modelo 100 (Renta / IRPF anual):</strong> Aviso en junio<br />
                    📊 <strong>Modelo 390 (IVA anual):</strong> Aviso en enero
                  </p>
                )}
              </div>
            </Card>

            {/* Email de notificaciones */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                  <Globe size={18} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">Email de notificaciones</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Si está vacío, se usará el email de tu cuenta</p>
                </div>
              </div>
              <CompactField
                label="Email para recibir alertas"
                icon={<Mail size={9} />}
                type="email"
                placeholder="notificaciones@tuempresa.com"
                value={(formData as any).notification_email || ''}
                onChange={(v: string) => setFormData({ ...formData, notification_email: v } as any)}
              />
            </Card>

            {/* Botones trigger manuales */}
            <Card className="p-5 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prueba manual de agentes</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const token = localStorage.getItem('token');
                    await fetch('/api/reminders/trigger-cobros', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                    alert('Agente de cobros ejecutado. Revisa los logs del servidor.');
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-500/20 transition-all"
                >
                  Ejecutar Cobros Ahora
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const token = localStorage.getItem('token');
                    await fetch('/api/reminders/trigger-impuestos', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                    alert('Agente de impuestos ejecutado. Revisa los logs del servidor.');
                  }}
                  className="flex-1 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-amber-500/20 transition-all"
                >
                  Ejecutar Impuestos Ahora
                </button>
              </div>
            </Card>

            <button
              type="button"
              onClick={handleSubmit as any}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-purple-500/20"
            >
              {saved ? '✅ Guardado' : 'Guardar Configuración de Alertas'}
            </button>
          </motion.div>
        ) : activeTab === 'gestor' ? (
          <GestorTab key="gestor" plan={plan} canUse={canUse} />
        ) : activeTab === 'plan' ? (
          <PricingTab key="plan" currentPlan={plan} />
        ) : null}
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

// ── Pestaña Acceso Gestor ─────────────────────────────────
function GestorTab({ plan, canUse }: { plan: Plan; canUse: (f: Feature) => boolean }) {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [upgradeModal, setUpgradeModal] = React.useState(false);

  const gestorUrl = token ? `${window.location.origin}/?g=${token}` : null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem('token');
      const res = await fetch('/api/settings/gestor-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (res.ok) setToken(data.token);
    } catch {}
    finally { setLoading(false); }
  };

  const handleRevoke = async () => {
    if (!confirm('¿Revocar el acceso del gestor? El enlace actual dejará de funcionar.')) return;
    const t = localStorage.getItem('token');
    await fetch('/api/settings/gestor-token', { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    setToken(null);
  };

  const handleCopy = () => {
    if (!gestorUrl) return;
    navigator.clipboard.writeText(gestorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!canUse('gestor')) {
    return (
      <motion.div key="gestor-locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
        <div className="bg-white/3 border border-white/8 rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-4">
          <Lock size={32} className="text-slate-600" />
          <div>
            <p className="font-black text-white text-base">Acceso Gestor — Plan Profesional</p>
            <p className="text-slate-500 text-sm font-bold mt-1 max-w-xs mx-auto">
              Genera un enlace seguro para que tu asesor/gestor pueda consultar todos tus datos en tiempo real.
            </p>
          </div>
          <button onClick={() => setUpgradeModal(true)} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all">
            Ver Plan Profesional
          </button>
        </div>
        <UpgradeModal open={upgradeModal} onClose={() => setUpgradeModal(false)} feature="gestor" currentPlan={plan} requiredPlan={PLAN_REQUIRED['gestor']} />
      </motion.div>
    );
  }

  return (
    <motion.div key="gestor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="bg-purple-500/5 border border-purple-500/15 rounded-2xl px-4 py-3 space-y-1">
        <p className="text-[11px] font-black text-purple-300">Acceso de solo lectura para tu gestor</p>
        <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
          Genera un enlace único y compártelo con tu asesor. Podrá ver tus facturas, gastos y dashboard sin poder modificar nada. Válido 1 año y revocable en cualquier momento.
        </p>
      </div>

      {gestorUrl ? (
        <div className="space-y-3">
          <div className="bg-white/3 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Link size={11} className="text-emerald-400" />
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Enlace activo</p>
            </div>
            <p className="text-[10px] text-slate-400 font-mono break-all leading-relaxed">{gestorUrl}</p>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">
                <Copy size={10} /> {copied ? '¡Copiado!' : 'Copiar enlace'}
              </button>
              <button onClick={handleRevoke} className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">
                <TrashIcon size={10} /> Revocar acceso
              </button>
            </div>
          </div>
          <p className="text-[9px] text-slate-600 font-bold px-1">Tu gestor puede ver todos los datos en modo solo lectura — no puede crear, editar ni eliminar.</p>
        </div>
      ) : (
        <button onClick={handleGenerate} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all">
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Link size={14} />}
          {loading ? 'Generando…' : 'Generar enlace de acceso para el gestor'}
        </button>
      )}
    </motion.div>
  );
}

// ── Pestaña Mi Plan ────────────────────────────────────────
const PLANS: Array<{
  id: Plan;
  label: string;
  subtitle: string;
  color: string;
  accentBg: string;
  accentBorder: string;
  features: string[];
  badge?: string;
}> = [
  {
    id: 'libre',
    label: 'Libre',
    subtitle: 'Para empezar sin coste',
    color: 'text-slate-300',
    accentBg: 'bg-slate-500/10',
    accentBorder: 'border-slate-500/20',
    features: [
      '5 facturas al mes',
      '2 clientes',
      'Dashboard básico',
      'Asistente IA (limitado)',
      'Marca de agua en facturas PDF',
    ],
  },
  {
    id: 'autonomo',
    label: 'Autónomo',
    subtitle: 'Para el día a día profesional',
    color: 'text-indigo-300',
    accentBg: 'bg-indigo-500/10',
    accentBorder: 'border-indigo-500/20',
    badge: 'Más popular',
    features: [
      'Facturas y abonos ilimitados',
      'Clientes ilimitados',
      'Escaneo IA de tickets (OCR)',
      'Agente de cobros automático',
      'Alertas fiscales inteligentes',
      'Exportar libros CSV',
      'Logo de empresa en facturas',
      'Sin marca de agua',
    ],
  },
  {
    id: 'profesional',
    label: 'Profesional',
    subtitle: 'Todo en uno, sin límites',
    color: 'text-purple-300',
    accentBg: 'bg-purple-500/10',
    accentBorder: 'border-purple-500/20',
    features: [
      'Todo lo incluido en Autónomo',
      'Envío de facturas por email',
      'Facturas recurrentes automáticas',
      'Acceso gestor de solo lectura',
    ],
  },
];

function PricingTab({ currentPlan }: { currentPlan: Plan }) {
  const [loading, setLoading] = React.useState<Plan | null>(null);
  const [activePlan, setActivePlan] = React.useState<Plan>(currentPlan);

  const handleSelect = async (planId: Plan) => {
    if (planId === activePlan) return;
    setLoading(planId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/me/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.ok) {
        setActivePlan(planId);
        // Notifica a App.tsx para refrescar el plan en el contexto
        window.dispatchEvent(new CustomEvent('faktio:plan-changed', { detail: planId }));
      }
    } catch {}
    finally { setLoading(null); }
  };

  return (
    <motion.div key="plan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="bg-white/3 border border-white/8 rounded-2xl px-4 py-3 space-y-0.5">
        <p className="text-[11px] font-black text-white">Plan y Suscripción</p>
        <p className="text-[10px] text-slate-500 font-bold">Cambia de plan en cualquier momento. Los cambios son inmediatos.</p>
      </div>

      <div className="space-y-3">
        {PLANS.map(p => {
          const isActive = activePlan === p.id;
          const isLoading = loading === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-4 transition-all ${isActive ? `${p.accentBg} ${p.accentBorder} shadow-lg` : 'bg-white/2 border-white/5 hover:bg-white/5'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className={`font-black text-sm ${isActive ? p.color : 'text-white'}`}>{p.label}</p>
                    {p.badge && (
                      <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-lg text-[8px] font-black text-amber-400 uppercase tracking-widest">{p.badge}</span>
                    )}
                    {isActive && (
                      <span className={`px-2 py-0.5 ${p.accentBg} ${p.accentBorder} border rounded-lg text-[8px] font-black ${p.color} uppercase tracking-widest`}>Tu plan actual</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold mb-3">{p.subtitle}</p>
                  <ul className="space-y-1.5">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? p.color.replace('text-', 'bg-') : 'bg-slate-600'}`} />
                        <span className={`text-[10px] font-bold ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="shrink-0">
                  {isActive ? (
                    <div className={`w-8 h-8 rounded-xl ${p.accentBg} border ${p.accentBorder} flex items-center justify-center`}>
                      <CheckCircle2 size={16} className={p.color} />
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelect(p.id)}
                      disabled={!!loading}
                      className="px-4 py-2 bg-white/8 border border-white/10 hover:bg-white/15 hover:border-white/20 disabled:opacity-40 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all"
                    >
                      {isLoading ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Activar'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-slate-600 font-bold text-center px-4">
        Próximamente se integrará el pago automático vía PayPal. Por ahora los cambios son manuales y gratuitos durante el periodo de prueba.
      </p>
    </motion.div>
  );
}

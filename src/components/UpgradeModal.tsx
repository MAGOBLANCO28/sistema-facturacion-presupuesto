import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Plan, PLAN_LABELS, Feature } from '../context/PlanContext';

interface Props {
  open: boolean;
  onClose: () => void;
  feature: Feature;
  currentPlan: Plan;
  requiredPlan: Plan;
}

const FEATURE_INFO: Record<Feature, { title: string; description: string; icon: string }> = {
  documents: {
    title: 'Facturas ilimitadas',
    description: 'El Plan Libre permite hasta 5 facturas al mes. Con Autónomo, emite todas las que necesites sin restricciones.',
    icon: '📄',
  },
  clients: {
    title: 'Clientes ilimitados',
    description: 'El Plan Libre permite hasta 2 clientes. Con Autónomo, gestiona todos tus clientes sin límite.',
    icon: '👥',
  },
  ocr: {
    title: 'Escaneo inteligente de tickets',
    description: 'Fotografía tus tickets y recibos y la IA extrae automáticamente todos los datos. Disponible desde el Plan Autónomo.',
    icon: '📷',
  },
  agents: {
    title: 'Agentes IA de cobros e impuestos',
    description: 'Recordatorios automáticos de facturas pendientes y avisos fiscales inteligentes. Disponible desde el Plan Autónomo.',
    icon: '🤖',
  },
  csv: {
    title: 'Exportar libros CSV para tu gestor',
    description: 'Descarga tu libro de ingresos y gastos en formato CSV, listo para enviárselo a tu gestor o importar en otros programas. Disponible desde el Plan Autónomo.',
    icon: '📊',
  },
  logo: {
    title: 'Logo en tus facturas',
    description: 'Añade el logo de tu empresa en las facturas PDF para dar una imagen más profesional a tus clientes. Disponible desde el Plan Autónomo.',
    icon: '🎨',
  },
};

const PLAN_PERKS: Record<Plan, string[]> = {
  libre: [],
  autonomo: [
    'Facturas y abonos ilimitados',
    'Clientes ilimitados',
    'Escaneo IA de tickets (OCR)',
    'Agente de cobros automático',
    'Alertas fiscales inteligentes',
    'Asistente IA sin restricciones',
    'Exportar libros CSV para el gestor',
    'Logo de empresa en facturas PDF',
  ],
  profesional: [
    'Todo lo del Plan Autónomo',
    'Envío de facturas por email directamente desde Faktio',
    'Facturas recurrentes automáticas para clientes fijos',
    'Acceso de solo lectura para tu gestor/asesor',
  ],
};

export default function UpgradeModal({ open, onClose, feature, currentPlan, requiredPlan }: Props) {
  const info = FEATURE_INFO[feature];
  const perks = PLAN_PERKS[requiredPlan];
  const planLabel = PLAN_LABELS[requiredPlan];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="relative p-6 pb-4 bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border-b border-white/5">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={16} />
                </button>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xl">
                    {info.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Lock size={10} className="text-amber-400" />
                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Función bloqueada</p>
                    </div>
                    <h3 className="font-black text-white text-base tracking-tight">{info.title}</h3>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-bold leading-relaxed">{info.description}</p>
              </div>

              {/* Plan required */}
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Requiere</p>
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-purple-400" />
                      <p className="font-black text-white text-sm">{planLabel}</p>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-600" />
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tu plan actual</p>
                    <p className="font-black text-slate-400 text-sm">{PLAN_LABELS[currentPlan]}</p>
                  </div>
                </div>

                <div className="bg-white/3 border border-white/5 rounded-2xl p-4 space-y-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Incluye</p>
                  {perks.map((perk, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-bold text-slate-300">{perk}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-indigo-500/8 border border-indigo-500/15 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-bold text-indigo-300/80 leading-relaxed">
                    Para cambiar tu plan, contacta con el administrador de la aplicación o escribe a{' '}
                    <span className="text-indigo-300 font-black">soporte@faktio.com</span>
                  </p>
                </div>

                <button
                  onClick={onClose}
                  className="w-full py-3 bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-white/10 hover:text-white transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

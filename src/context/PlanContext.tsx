import React, { createContext, useContext, useMemo } from 'react';

export type Plan = 'libre' | 'autonomo' | 'profesional';

interface PlanContextValue {
  plan: Plan;
  canUse: (feature: Feature) => boolean;
}

export type Feature =
  | 'documents'   // crear facturas/abonos (Autónomo+, con límite en Libre)
  | 'clients'     // añadir clientes (Autónomo+, con límite en Libre)
  | 'ocr'         // escanear tickets con IA
  | 'agents'      // agentes cobros/impuestos
  | 'csv'         // exportar CSV (solo Profesional)
  | 'logo';       // subir logo empresa (solo Profesional)

const FEATURE_PLANS: Record<Feature, Plan[]> = {
  documents: ['autonomo', 'profesional'],
  clients:   ['autonomo', 'profesional'],
  ocr:       ['autonomo', 'profesional'],
  agents:    ['autonomo', 'profesional'],
  csv:       ['autonomo', 'profesional'],
  logo:      ['autonomo', 'profesional'],
};

export const PLAN_LABELS: Record<Plan, string> = {
  libre: 'Plan Libre',
  autonomo: 'Plan Autónomo',
  profesional: 'Plan Profesional',
};

export const PLAN_REQUIRED: Record<Feature, Plan> = {
  documents: 'autonomo',
  clients:   'autonomo',
  ocr:       'autonomo',
  agents:    'autonomo',
  csv:       'autonomo',
  logo:      'autonomo',
};

const PlanContext = createContext<PlanContextValue>({
  plan: 'libre',
  canUse: () => false,
});

export function PlanProvider({ plan, children }: { plan: Plan; children: React.ReactNode }) {
  const canUse = useMemo(() => (feature: Feature): boolean => {
    return FEATURE_PLANS[feature].includes(plan);
  }, [plan]);

  return (
    <PlanContext.Provider value={{ plan, canUse }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}

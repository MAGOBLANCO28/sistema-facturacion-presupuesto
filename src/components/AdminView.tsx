import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Shield, Users, FileText, Receipt, LogIn, Trash2, Check, X, RefreshCw, ChevronDown } from 'lucide-react';

type Plan = 'libre' | 'autonomo' | 'profesional';

const PLAN_LABELS: Record<Plan, string> = {
  libre: 'Libre',
  autonomo: 'Autónomo',
  profesional: 'Profesional',
};

const PLAN_COLORS: Record<Plan, string> = {
  libre: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  autonomo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  profesional: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

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

interface Tenant {
  id: number;
  login_email: string;
  company_name: string | null;
  owner_name: string | null;
  fiscal_email: string | null;
  is_admin: boolean;
  plan: Plan;
  created_at: string;
  total_docs: string;
  total_expenses: string;
}

interface AdminViewProps {
  onImpersonate: (token: string, email: string) => void;
}

export default function AdminView({ onImpersonate }: AdminViewProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [impersonating, setImpersonating] = useState<number | null>(null);
  const [changingPlan, setChangingPlan] = useState<number | null>(null);
  const [myPlan, setMyPlan] = useState<Plan>('libre');
  const [switchingMyPlan, setSwitchingMyPlan] = useState(false);

  const fetchMyPlan = useCallback(async () => {
    try {
      const res = await authFetch('/api/me');
      const data = await res.json();
      if (data.plan) setMyPlan(data.plan as Plan);
    } catch {}
  }, []);

  const handleSwitchMyPlan = async (plan: Plan) => {
    setSwitchingMyPlan(true);
    try {
      const res = await authFetch('/api/me/plan', {
        method: 'PATCH',
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        setMyPlan(plan);
        window.dispatchEvent(new CustomEvent('faktio:plan-changed', { detail: plan }));
      }
    } catch {}
    finally { setSwitchingMyPlan(false); }
  };

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/tenants');
      const data = await res.json();
      setTenants(Array.isArray(data) ? data : []);
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); fetchMyPlan(); }, [fetchTenants, fetchMyPlan]);

  const handleImpersonate = async (tenant: Tenant) => {
    setImpersonating(tenant.id);
    try {
      const res = await authFetch(`/api/admin/impersonate/${tenant.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.token) {
        onImpersonate(data.token, tenant.login_email);
      }
    } catch {
      alert('Error al impersonar usuario');
    } finally {
      setImpersonating(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await authFetch(`/api/admin/tenant/${id}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      fetchTenants();
    } catch {
      alert('Error al eliminar usuario');
    }
  };

  const handleChangePlan = async (tenantId: number, newPlan: Plan) => {
    setChangingPlan(tenantId);
    try {
      const res = await authFetch(`/api/admin/tenant/${tenantId}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ plan: newPlan }),
      });
      if (res.ok) {
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, plan: newPlan } : t));
      }
    } catch {
      alert('Error al cambiar el plan');
    } finally {
      setChangingPlan(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center">
            <Shield size={18} className="text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tighter">Panel de Administración</h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{tenants.length} usuarios registrados</p>
          </div>
        </div>
        <button
          onClick={fetchTenants}
          className="p-2.5 bg-white/5 border border-white/5 rounded-xl text-slate-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="bg-rose-500/5 border border-rose-500/15 rounded-2xl px-4 py-3 flex items-center gap-2.5">
        <Shield size={12} className="text-rose-400 shrink-0" />
        <p className="text-[10px] text-rose-300/70 font-bold">
          Zona restringida. Al entrar como un usuario verás su cuenta durante 2 horas. No modifiques datos sin su consentimiento.
        </p>
      </div>

      {/* Selector de plan propio para pruebas */}
      <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Check size={12} className="text-amber-400 shrink-0" />
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Modo de prueba — Mi plan actual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['libre', 'autonomo', 'profesional'] as Plan[]).map(p => (
            <button
              key={p}
              onClick={() => handleSwitchMyPlan(p)}
              disabled={switchingMyPlan || myPlan === p}
              className={`px-3 py-1.5 rounded-xl border font-black text-[9px] uppercase tracking-widest transition-all ${
                myPlan === p
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 cursor-default'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40'
              }`}
            >
              {switchingMyPlan && myPlan !== p ? (
                <span className="inline-block w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                PLAN_LABELS[p]
              )}
            </button>
          ))}
          <span className="text-[9px] text-slate-600 font-bold">Cambia tu propio plan para probar la UI sin impersonar</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map(tenant => (
            <motion.div
              key={tenant.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/3 border border-white/5 rounded-2xl p-4 hover:bg-white/5 hover:border-white/10 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-white text-sm">{tenant.login_email}</p>
                    {tenant.is_admin && (
                      <span className="px-2 py-0.5 bg-rose-500/15 border border-rose-500/20 rounded-lg text-[8px] font-black text-rose-400 uppercase tracking-widest">Admin</span>
                    )}
                    <span className={`px-2 py-0.5 border rounded-lg text-[8px] font-black uppercase tracking-widest ${PLAN_COLORS[tenant.plan || 'libre']}`}>
                      {PLAN_LABELS[tenant.plan || 'libre']}
                    </span>
                  </div>
                  {tenant.company_name && (
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{tenant.company_name}{tenant.owner_name ? ` · ${tenant.owner_name}` : ''}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-[9px] text-slate-500 font-bold">
                      <FileText size={9} /> {tenant.total_docs} docs
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-slate-500 font-bold">
                      <Receipt size={9} /> {tenant.total_expenses} gastos
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-slate-600 font-bold">
                      <Users size={9} /> {new Date(tenant.created_at).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Plan selector — visible para todos */}
                  {!tenant.is_admin && (
                    <div className="relative">
                      <select
                        value={tenant.plan || 'libre'}
                        onChange={e => handleChangePlan(tenant.id, e.target.value as Plan)}
                        disabled={changingPlan === tenant.id}
                        className="appearance-none pl-2.5 pr-6 py-2 bg-white/5 border border-white/8 text-slate-300 text-[10px] font-black rounded-xl cursor-pointer hover:bg-white/10 transition-all disabled:opacity-50 outline-none"
                      >
                        <option value="libre">Libre</option>
                        <option value="autonomo">Autónomo</option>
                        <option value="profesional">Profesional</option>
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  )}
                  {!tenant.is_admin && (
                    <>
                      <button
                        onClick={() => handleImpersonate(tenant)}
                        disabled={impersonating === tenant.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {impersonating === tenant.id
                          ? <div className="w-3 h-3 border border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                          : <LogIn size={11} />}
                        Entrar
                      </button>
                      {deleteConfirm === tenant.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleDelete(tenant.id)} className="p-2 bg-rose-500/20 text-rose-400 rounded-xl hover:bg-rose-500/30 transition-all">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} className="p-2 bg-white/5 text-slate-500 rounded-xl hover:bg-white/10 transition-all">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(tenant.id)} className="p-2 bg-white/5 text-slate-600 hover:bg-rose-500/15 hover:text-rose-400 rounded-xl transition-all">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

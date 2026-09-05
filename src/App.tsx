import React, { useState, useEffect } from 'react';
import {
  History,
  Settings as SettingsIcon,
  PlusCircle,
  ChevronLeft,
  LogOut,
  LayoutDashboard,
  Receipt,
  FileText,
  MinusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentType, DocumentData, CompanySettings } from './types';
import DocumentEditor from './components/DocumentEditor';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import DocumentPreview from './components/DocumentPreview';
import AuthView from './components/AuthView';
import DashboardView from './components/DashboardView';
import ExpensesView from './components/ExpensesView';
import BudgetsView from './components/BudgetsView';
import AbonosView from './components/AbonosView';
import Header from './components/common/Header';
import ErrorBoundary from './components/common/ErrorBoundary';

const AMBER = '#F59E0B';
const RED   = '#ef4444';

const API = (path: string, options?: RequestInit) => {
  const token = localStorage.getItem('token');
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
};

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'dashboard' | 'editor' | 'history' | 'settings' | 'preview' | 'expenses' | 'budgets' | 'abonos'>('dashboard');
  const [docType, setDocType] = useState<DocumentType>('invoice');
  const [selectedDoc, setSelectedDoc] = useState<DocumentData | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [notifications, setNotifications] = useState<string[]>([]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > 10 * 60 * 1000) handleLogout();
    }, 30000);
    const activityHandler = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', activityHandler);
    window.addEventListener('keydown', activityHandler);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', activityHandler);
      window.removeEventListener('keydown', activityHandler);
    };
  }, [token, lastActivity]);

  useEffect(() => {
    if (token) { fetchSettings(); checkFiscalAlerts(); }
  }, [token]);

  const checkFiscalAlerts = async () => {
    try {
      const res = await API('/api/reports/real-income');
      if (!res.ok) return;
      const report = await res.json();
      const alerts: string[] = [];
      if (report.ivaToPay > 3000) alerts.push("Reserva de IVA elevada (>3000€). Considera pagos a cuenta.");
      if (report.totalExpense < report.totalIncome * 0.1) alerts.push("Bajo nivel de gastos. ¿Has olvidado registrar tickets?");
      setNotifications(alerts);
    } catch {}
  };

  const fetchSettings = async () => {
    try {
      const res = await API('/api/settings');
      if (res.status === 401) { handleLogout(); return; }
      setSettings(await res.json());
    } catch (err) { console.error('Error fetching settings:', err); }
  };

  const handleLogin = (newToken: string, isNew?: boolean) => {
    setToken(newToken);
    if (isNew) setView('settings');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setSettings(null);
    setView('dashboard');
  };

  const handleRectify = async (doc: DocumentData) => {
    if (!confirm(`¿Rectificar factura ${doc.number}?`)) return;
    try {
      const res = await API(`/api/documents/rectify/${doc.id}`, { method: 'POST' });
      if (res.ok) setView('history');
    } catch (err) { console.error('Error rectifying:', err); }
  };

  const handleConvertToInvoice = async (id: number) => {
    if (!confirm('¿Deseas convertir este presupuesto en una factura legal emitida?')) return;
    try {
      const res = await API(`/api/documents/convert/${id}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSelectedDoc(data);
        setDocType('invoice');
        setView('editor');
      }
    } catch (err) { console.error('Error converting:', err); }
  };

  // Crear abono parcial desde una factura existente
  const handleCreatePartialAbono = (invoice: DocumentData) => {
    // Pre-rellenar el editor con los datos de la factura, tipo abono
    setSelectedDoc({
      ...invoice,
      id: undefined,           // nuevo documento
      type: 'abono',
      number: '',              // se auto-generará ABO-YYYY-XXX
      status: 'Emitida',
      original_invoice_id: invoice.id,
      is_rectificative: true,
    });
    setDocType('abono');
    setView('editor');
  };

  if (!token) return <ErrorBoundary><AuthView onLogin={handleLogin} /></ErrorBoundary>;

  const handleCreateNew = (type: DocumentType) => {
    setDocType(type);
    setSelectedDoc(null);
    setView('editor');
  };

  const editorOnSave = () => {
    if (docType === 'quote') setView('budgets');
    else if (docType === 'abono') setView('abonos');
    else setView('history');
  };

  // Al volver desde preview, saber a qué sección ir
  const backFromPreview = () => {
    if (!selectedDoc) { setView('history'); return; }
    if (selectedDoc.type === 'quote') setView('budgets');
    else if (selectedDoc.type === 'abono') setView('abonos');
    else setView('history');
  };

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-[#0f172a] flex text-slate-100 font-sans selection:bg-purple-500/30">
      {/* Desktop Sidebar */}
      <aside
        className={`${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'} transition-all duration-500 flex flex-col fixed h-full z-50 lg:relative border-r border-white/5 bg-[#0f172a]/90 backdrop-blur-3xl shadow-2xl`}
      >
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/20 border border-white/10 group-hover:scale-110 transition-all duration-500 shrink-0">
              <img src="/logo-512.png" alt="Faktio" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tighter text-white leading-none">FAKTIO <span className="text-purple-400">2026</span></h1>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1">Deep Space Node</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-6 space-y-2 mt-8">
          <SidebarItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <SidebarItem icon={<Receipt size={20} />} label="Gastos" active={view === 'expenses'} onClick={() => setView('expenses')} />
          <div className="py-2"><div className="h-px bg-white/5 w-full" /></div>
          <SidebarItem icon={<PlusCircle size={20} />} label="Facturar" active={view === 'editor' && docType === 'invoice'} onClick={() => handleCreateNew('invoice')} />
          <SidebarItem icon={<FileText size={20} />} label="Presupuestos" active={view === 'budgets'} onClick={() => setView('budgets')} activeColor={AMBER} />
          <SidebarItem icon={<History size={20} />} label="Historial" active={view === 'history'} onClick={() => setView('history')} />
          <SidebarItem icon={<MinusCircle size={20} />} label="Abonos" active={view === 'abonos'} onClick={() => setView('abonos')} activeColor={RED} />
          <SidebarItem icon={<SettingsIcon size={20} />} label="Ajustes" active={view === 'settings'} onClick={() => setView('settings')} />
        </nav>

        <div className="p-6 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-5 py-3 text-orange-400/60 hover:text-orange-400 hover:bg-orange-500/10 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest border border-transparent hover:border-orange-500/20 mb-6"
          >
            <LogOut size={18} /> Cerrar Sesión
          </button>
          <div className="space-y-3 pt-6 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">COMPLIANCE</p>
            </div>
            <p className="text-[10px] font-bold text-slate-600 leading-tight">RGPD · LOPDGDD · Inalterabilidad fiscal</p>
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <p className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest leading-none">VeriFactu RD 1007/2023 · En desarrollo</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden relative">
        <Header
          onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
          onSettingsClick={() => setView('settings')}
          notifications={notifications}
        />

        <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 lg:p-12 pb-32">
          <AnimatePresence mode="wait">

            {view === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <DashboardView />
              </motion.div>
            )}

            {view === 'budgets' && (
              <motion.div key="budgets" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <BudgetsView
                  onEdit={(doc) => { setSelectedDoc(doc); setDocType(doc.type); setView('editor'); }}
                  onPreview={(doc) => { setSelectedDoc(doc); setView('preview'); }}
                  onCreateNew={() => handleCreateNew('quote')}
                />
              </motion.div>
            )}

            {view === 'expenses' && (
              <motion.div key="expenses" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <ExpensesView />
              </motion.div>
            )}

            {view === 'abonos' && (
              <motion.div key="abonos" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <AbonosView
                  onPreview={(doc) => { setSelectedDoc(doc); setView('preview'); }}
                  onCreateNew={() => handleCreateNew('abono')}
                />
              </motion.div>
            )}

            {view === 'editor' && (
              <motion.div key={`editor-${docType}-${selectedDoc?.id ?? 'new'}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                <DocumentEditor
                  type={docType}
                  initialData={selectedDoc}
                  onSave={editorOnSave}
                  settings={settings}
                />
              </motion.div>
            )}

            {view === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <HistoryView
                  onEdit={(doc) => { setSelectedDoc(doc); setDocType(doc.type); setView('editor'); }}
                  onPreview={(doc) => { setSelectedDoc(doc); setView('preview'); }}
                  onRectify={handleRectify}
                  onCreateAbono={handleCreatePartialAbono}
                />
              </motion.div>
            )}

            {view === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                <div className="mb-4">
                  <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">
                    <ChevronLeft size={14} /> Volver al Dashboard
                  </button>
                </div>
                <SettingsView settings={settings} onUpdate={fetchSettings} />
              </motion.div>
            )}

            {view === 'preview' && selectedDoc && (
              <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <div className="mb-6">
                  <button onClick={backFromPreview} className="flex items-center gap-3 px-5 py-2.5 glass rounded-2xl text-slate-400 font-bold hover:text-white transition-all">
                    <ChevronLeft size={20} /> Volver
                  </button>
                </div>
                <DocumentPreview
                  doc={selectedDoc}
                  settings={settings}
                  onConvert={selectedDoc.type === 'quote' && selectedDoc.id ? () => handleConvertToInvoice(selectedDoc.id!) : undefined}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-2xl border-t border-white/5 px-6 py-4 flex items-center justify-between z-50">
        <MobileNavItem icon={<LayoutDashboard size={24} />} active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <MobileNavItem icon={<FileText size={24} />} active={view === 'budgets'} onClick={() => setView('budgets')} />
        <button
          onClick={() => handleCreateNew('invoice')}
          className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl -mt-10 border-4 border-[#0f172a]"
        >
          <PlusCircle size={28} />
        </button>
        <MobileNavItem icon={<MinusCircle size={24} />} active={view === 'abonos'} onClick={() => setView('abonos')} />
        <MobileNavItem icon={<SettingsIcon size={24} />} active={view === 'settings'} onClick={() => setView('settings')} />
      </nav>
    </div>
    </ErrorBoundary>
  );
}

function SidebarItem({ icon, label, active, onClick, activeColor }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-[1.25rem] transition-all duration-300 font-bold ${active ? 'bg-white/10 text-white shadow-lg border border-white/5' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
      style={active && activeColor ? { color: activeColor } : {}}
    >
      <span>{icon}</span>
      <span className="text-sm tracking-tight">{label}</span>
    </button>
  );
}

function MobileNavItem({ icon, active, onClick }: { icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`p-2 transition-all ${active ? 'text-purple-400 scale-110' : 'text-slate-600'}`}>
      {icon}
    </button>
  );
}

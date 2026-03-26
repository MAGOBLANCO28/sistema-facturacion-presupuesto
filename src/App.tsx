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
  Zap
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
import Header from './components/common/Header';

const AMBER = '#F59E0B'; // For Budgets

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
  const [view, setView] = useState<'dashboard' | 'editor' | 'history' | 'settings' | 'preview' | 'expenses' | 'budgets'>('dashboard');
  const [docType, setDocType] = useState<DocumentType>('invoice');
  const [selectedDoc, setSelectedDoc] = useState<DocumentData | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [notifications, setNotifications] = useState<string[]>([]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > 10 * 60 * 1000) {
        handleLogout();
      }
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
    if (token) {
        fetchSettings();
        checkFiscalAlerts();
    }
  }, [token]);

  const checkFiscalAlerts = async () => {
     try {
       const res = await API('/api/reports/real-income');
       const report = await res.json();
       const alerts = [];
       if (report.ivaToPay > 3000) alerts.push("Reserva de IVA elevada (>3000€). Considera pagos a cuenta.");
       if (report.totalExpense < report.totalIncome * 0.1) alerts.push("Bajo nivel de gastos. ¿Has olvidado registrar tickets?");
       setNotifications(alerts);
     } catch (e) {}
  };

  const fetchSettings = async () => {
    try {
      const res = await API('/api/settings');
      if (res.status === 401) { handleLogout(); return; }
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const handleLogin = (newToken: string) => setToken(newToken);

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
    } catch (err) {
      console.error('Error rectifying:', err);
    }
  };

  const handleConvertToInvoice = async (id: number) => {
    if (!confirm('¿Deseas convertir este presupuesto en una factura legal?')) return;
    try {
      const res = await API(`/api/documents/convert/${id}`, { method: 'POST' });
      if (res.ok) setView('history');
    } catch (err) {
      console.error('Error converting:', err);
    }
  };

  if (!token) return <AuthView onLogin={handleLogin} />;

  const handleCreateNew = (type: DocumentType) => {
    setDocType(type);
    setSelectedDoc(null);
    setView('editor');
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex text-slate-100 font-sans selection:bg-purple-500/30">
      {/* Desktop Sidebar */}
      <aside
        className={`${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'} transition-all duration-500 flex flex-col fixed h-full z-50 lg:relative border-r border-white/5 bg-[#0f172a]/90 backdrop-blur-3xl shadow-2xl`}
      >
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setView('dashboard')}>
             <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 border border-white/10 group-hover:rotate-12 group-hover:scale-110 transition-all duration-500">
                <Zap className="text-white fill-white" size={24} />
             </div>
             <div>
                <h1 className="font-black text-xl tracking-tighter text-white leading-none">FAKTIO <span className="text-purple-400">2026</span></h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1">Deep Space Node</p>
             </div>
          </div>
        </div>

        <nav className="flex-1 px-6 space-y-2 mt-8">
          <SidebarItem icon={<LayoutDashboard size={20} />} label="Dasboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <SidebarItem icon={<Receipt size={20} />} label="Gastos" active={view === 'expenses'} onClick={() => setView('expenses')} />
          <div className="py-2"><div className="h-px bg-white/5 w-full" /></div>
          <SidebarItem icon={<PlusCircle size={20} />} label="Facturar" active={view === 'editor' && docType === 'invoice'} onClick={() => handleCreateNew('invoice')} />
          <SidebarItem icon={<FileText size={20} />} label="Presupuestos" active={view === 'budgets'} onClick={() => setView('budgets')} activeColor={AMBER} />
          <SidebarItem icon={<History size={20} />} label="Historial" active={view === 'history'} onClick={() => setView('history')} />
          <SidebarItem icon={<SettingsIcon size={20} />} label="Ajustes" active={view === 'settings'} onClick={() => setView('settings')} />
        </nav>

        <div className="p-6 mt-auto">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-6 py-4 text-orange-400/60 hover:text-orange-400 hover:bg-orange-500/10 rounded-[1.5rem] transition-all font-black text-[10px] uppercase tracking-widest border border-transparent hover:border-orange-500/20"
          >
            <LogOut size={18} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
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
                />
              </motion.div>
            )}
            {view === 'expenses' && (
              <motion.div key="expenses" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <ExpensesView />
              </motion.div>
            )}
            {view === 'editor' && (
              <motion.div key="editor" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                <DocumentEditor type={docType} initialData={selectedDoc} onSave={() => setView('history')} settings={settings} />
              </motion.div>
            )}
            {view === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <HistoryView
                  onEdit={(doc) => { setSelectedDoc(doc); setDocType(doc.type); setView('editor'); }}
                  onPreview={(doc) => { setSelectedDoc(doc); setView('preview'); }}
                  onRectify={handleRectify}
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
                <div className="mb-6 flex items-center justify-between">
                  <button onClick={() => setView(selectedDoc.type === 'quote' ? 'budgets' : 'history')} className="flex items-center gap-3 px-5 py-2.5 glass rounded-2xl text-slate-400 font-bold hover:text-white transition-all">
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

        {/* Global VeriFactu Disclaimer */}
        <div className="fixed bottom-0 right-0 left-0 lg:left-72 glass border-t border-white/5 px-8 py-3 z-30 flex flex-col md:flex-row items-center justify-between gap-2">
           <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center md:text-left transition-colors">
                Faktio 2026 cumple con la Ley de Trazabilidad VeriFactu.
              </p>
           </div>
           <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">v1.3 // DEEP SPACE</p>
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
        <MobileNavItem icon={<Receipt size={24} />} active={view === 'expenses'} onClick={() => setView('expenses')} />
        <MobileNavItem icon={<SettingsIcon size={24} />} active={view === 'settings'} onClick={() => setView('settings')} />
      </nav>
    </div>
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

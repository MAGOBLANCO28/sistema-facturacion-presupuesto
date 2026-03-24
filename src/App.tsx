import React, { useState, useEffect } from 'react';
import {
  History,
  Settings as SettingsIcon,
  PlusCircle,
  ChevronLeft,
  Menu,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentType, DocumentData, CompanySettings } from './types';
import DocumentEditor from './components/DocumentEditor';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import DocumentPreview from './components/DocumentPreview';
import AuthView from './components/AuthView';

const ACCENT = '#1e3a5f';

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
  const [view, setView] = useState<'editor' | 'history' | 'settings' | 'preview'>('editor');
  const [docType, setDocType] = useState<DocumentType>('invoice');
  const [selectedDoc, setSelectedDoc] = useState<DocumentData | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (token) fetchSettings();
  }, [token]);

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
  };

  if (!token) return <AuthView onLogin={handleLogin} />;

  const handleCreateNew = (type: DocumentType) => {
    setDocType(type);
    setSelectedDoc(null);
    setView('editor');
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex text-zinc-900 font-sans">
      {/* Sidebar */}
      <aside
        className={`${isSidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 flex flex-col fixed h-full z-20`}
        style={{ backgroundColor: ACCENT }}
      >
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1 rounded transition-colors ml-auto text-white opacity-60 hover:opacity-100"
            >
              {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} className="mx-auto" />}
            </button>
          </div>

          {isSidebarOpen && (
            <div className="flex flex-col items-center text-center">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="w-16 h-16 object-contain mb-2 rounded-xl bg-white p-1" />
              ) : (
                <div className="w-16 h-16 mb-2">
                  <svg viewBox="0 0 100 100" className="w-full h-full text-white" fill="currentColor">
                    <path d="M35 35 L35 80 L55 80 L55 20 L45 20 L45 50 L35 50 Z" />
                    <rect x="60" y="20" width="25" height="5" />
                    <rect x="65" y="35" width="20" height="5" />
                    <rect x="70" y="50" width="15" height="30" />
                  </svg>
                </div>
              )}
              <h1 className="font-black text-sm tracking-widest text-white leading-none">Faktio</h1>
              <p className="text-[7px] uppercase tracking-tighter font-bold mt-1 opacity-50 text-white">Facturación profesional</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-2">
          <SidebarItem icon={<PlusCircle size={20} />} label="Nueva Factura" active={view === 'editor' && docType === 'invoice'} onClick={() => handleCreateNew('invoice')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<PlusCircle size={20} />} label="Nuevo Presupuesto" active={view === 'editor' && docType === 'quote'} onClick={() => handleCreateNew('quote')} collapsed={!isSidebarOpen} />
          <div className="my-4 mx-2 opacity-20" style={{ borderTop: '1px solid white' }} />
          <SidebarItem icon={<History size={20} />} label="Historial" active={view === 'history'} onClick={() => setView('history')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<SettingsIcon size={20} />} label="Configuración" active={view === 'settings'} onClick={() => setView('settings')} collapsed={!isSidebarOpen} />
        </nav>

        <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div className={`flex items-center gap-3 ${!isSidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              {settings?.owner_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-semibold truncate text-white">{settings?.owner_name || 'Mi cuenta'}</p>
                <p className="text-[10px] opacity-50 truncate text-white">Administrador</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg transition-all text-white opacity-50 hover:opacity-100"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <div className="max-w-5xl mx-auto p-8">
          <AnimatePresence mode="wait">
            {view === 'editor' && (
              <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <DocumentEditor type={docType} initialData={selectedDoc} onSave={() => setView('history')} settings={settings} />
              </motion.div>
            )}
            {view === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <HistoryView
                  onEdit={(doc) => { setSelectedDoc(doc); setDocType(doc.type); setView('editor'); }}
                  onPreview={(doc) => { setSelectedDoc(doc); setView('preview'); }}
                />
              </motion.div>
            )}
            {view === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <SettingsView settings={settings} onUpdate={fetchSettings} />
              </motion.div>
            )}
            {view === 'preview' && selectedDoc && (
              <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <div className="mb-6">
                  <button onClick={() => setView('history')} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors">
                    <ChevronLeft size={20} /> Volver al historial
                  </button>
                </div>
                <DocumentPreview doc={selectedDoc} settings={settings} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, collapsed }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${collapsed ? 'justify-center' : ''}`}
      style={{
        backgroundColor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        color: active ? 'white' : 'rgba(255,255,255,0.55)',
      }}
      title={collapsed ? label : ''}
      onMouseOver={e => { if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
      onMouseOut={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span>{icon}</span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}

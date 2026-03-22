import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  History, 
  Settings as SettingsIcon, 
  PlusCircle, 
  Printer, 
  Download, 
  Trash2,
  ChevronLeft,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentType, DocumentData, CompanySettings } from './types';
import DocumentEditor from './components/DocumentEditor';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import DocumentPreview from './components/DocumentPreview';

export default function App() {
  const [view, setView] = useState<'editor' | 'history' | 'settings' | 'preview'>('editor');
  const [docType, setDocType] = useState<DocumentType>('invoice');
  const [selectedDoc, setSelectedDoc] = useState<DocumentData | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const handleCreateNew = (type: DocumentType) => {
    setDocType(type);
    setSelectedDoc(null);
    setView('editor');
  };

  const handleViewHistory = () => {
    setView('history');
  };

  const handleViewSettings = () => {
    setView('settings');
  };

  const handleEditDoc = (doc: DocumentData) => {
    setSelectedDoc(doc);
    setDocType(doc.type);
    setView('editor');
  };

  const handlePreviewDoc = (doc: DocumentData) => {
    setSelectedDoc(doc);
    setView('preview');
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex text-zinc-900 font-sans">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-zinc-200 transition-all duration-300 flex flex-col fixed h-full z-20`}
      >
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="flex items-center justify-between w-full">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1 hover:bg-zinc-100 rounded transition-colors ml-auto"
            >
              {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} className="mx-auto" />}
            </button>
          </div>
          
          {isSidebarOpen && (
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 mb-2">
                <svg viewBox="0 0 100 100" className="w-full h-full text-red-700">
                  <path d="M35 35 L35 80 L55 80 L55 20 L45 20 L45 50 L35 50 Z" fill="currentColor" />
                  <line x1="45" y1="20" x2="85" y2="45" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="55" y1="30" x2="85" y2="50" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="65" y1="40" x2="85" y2="55" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="60" y1="50" x2="60" y2="80" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="75" y1="60" x2="75" y2="80" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="55" y1="80" x2="80" y2="80" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <h1 className="font-black text-sm tracking-widest text-red-700 leading-none">JUANMA</h1>
              <p className="text-[7px] uppercase tracking-tighter font-bold text-zinc-400 mt-1">Reformas e Integrales</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <SidebarItem 
            icon={<PlusCircle size={20} />} 
            label="Nueva Factura" 
            active={view === 'editor' && docType === 'invoice'} 
            onClick={() => handleCreateNew('invoice')}
            collapsed={!isSidebarOpen}
          />
          <SidebarItem 
            icon={<PlusCircle size={20} />} 
            label="Nuevo Presupuesto" 
            active={view === 'editor' && docType === 'quote'} 
            onClick={() => handleCreateNew('quote')}
            collapsed={!isSidebarOpen}
          />
          <div className="my-4 border-t border-zinc-100 mx-2" />
          <SidebarItem 
            icon={<History size={20} />} 
            label="Historial" 
            active={view === 'history'} 
            onClick={handleViewHistory}
            collapsed={!isSidebarOpen}
          />
          <SidebarItem 
            icon={<SettingsIcon size={20} />} 
            label="Configuración" 
            active={view === 'settings'} 
            onClick={handleViewSettings}
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <div className={`flex items-center gap-3 ${!isSidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-medium">
              JM
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-xs font-semibold truncate">Juan Manuel</p>
                <p className="text-[10px] text-zinc-500 truncate">Administrador</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <div className="max-w-5xl mx-auto p-8">
          <AnimatePresence mode="wait">
            {view === 'editor' && (
              <motion.div
                key="editor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DocumentEditor 
                  type={docType} 
                  initialData={selectedDoc} 
                  onSave={() => setView('history')}
                  settings={settings}
                />
              </motion.div>
            )}

            {view === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <HistoryView 
                  onEdit={handleEditDoc} 
                  onPreview={handlePreviewDoc}
                />
              </motion.div>
            )}

            {view === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <SettingsView 
                  settings={settings} 
                  onUpdate={fetchSettings} 
                />
              </motion.div>
            )}

            {view === 'preview' && selectedDoc && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="mb-6 flex justify-between items-center">
                  <button 
                    onClick={() => setView('history')}
                    className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    <ChevronLeft size={20} />
                    Volver al historial
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
  icon: React.ReactNode, 
  label: string, 
  active: boolean, 
  onClick: () => void,
  collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
        active 
          ? 'bg-red-50 text-red-700 font-medium' 
          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : ''}
    >
      <span className={active ? 'text-red-700' : 'text-zinc-400'}>{icon}</span>
      {!collapsed && <span className="text-sm">{label}</span>}
    </button>
  );
}

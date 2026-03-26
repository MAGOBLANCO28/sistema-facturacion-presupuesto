import React, { useState, useRef, useEffect } from 'react';
import { Bell, Settings, AlertCircle, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  onMenuClick?: () => void;
  onSettingsClick?: () => void;
  notifications?: string[];
}

export default function Header({ onMenuClick, onSettingsClick, notifications = [] }: Props) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-40 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <button onClick={onMenuClick} className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 relative">
        <div className="relative" ref={popoverRef}>
          <button 
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all relative group"
          >
            <Bell size={18} className="group-hover:rotate-12 transition-transform" />
            {notifications.length > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-purple-500 border-2 border-slate-900 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
            )}
          </button>

          <AnimatePresence>
            {isPopoverOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-2 w-80 glass rounded-[2rem] shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notificaciones</h3>
                    <span className="text-[10px] font-black bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">{notifications.length} Alertas</span>
                  </div>
                  
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {notifications.length > 0 ? notifications.map((notif, i) => (
                      <div key={i} className="p-3 bg-white/5 border border-white/5 rounded-2xl flex gap-3 group hover:bg-white/10 transition-colors">
                        <AlertCircle className="text-purple-400 shrink-0" size={14} />
                        <p className="text-[11px] font-bold text-slate-300 leading-snug">{notif}</p>
                      </div>
                    )) : (
                      <div className="py-8 text-center opacity-40">
                         <ShieldCheck className="mx-auto mb-2 text-emerald-400" size={24} />
                         <p className="text-[10px] font-black uppercase tracking-widest leading-none">Cero alertas fiscales</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {onSettingsClick && (
          <button onClick={onSettingsClick} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Settings size={18} />
          </button>
        )}

        <div className="hidden sm:flex items-center gap-3 pl-4 ml-2 border-l border-white/5">
           <div className="text-right">
              <p className="text-[10px] font-black text-white leading-none uppercase tracking-widest">Admin Node</p>
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">Conectado</p>
           </div>
           <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 flex items-center justify-center text-white text-[10px] font-black">
              AD
           </div>
        </div>
      </div>
    </header>
  );
}

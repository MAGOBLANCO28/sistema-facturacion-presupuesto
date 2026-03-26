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
    <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 p-4 sticky top-0 z-40 flex items-center justify-between print:hidden">
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
                className="absolute right-0 mt-2 w-80 bg-slate-800 border border-white/15 rounded-[2rem] shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-300">Notificaciones</h3>
                    <span className="text-[10px] font-black bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20">{notifications.length} Alertas</span>
                  </div>

                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {notifications.length > 0 ? notifications.map((notif, i) => (
                      <div key={i} className="p-3 bg-slate-700 border border-white/10 rounded-2xl flex gap-3 hover:bg-slate-600/50 transition-colors">
                        <AlertCircle className="text-purple-400 shrink-0 mt-0.5" size={14} />
                        <p className="text-[11px] font-bold text-slate-100 leading-snug">{notif}</p>
                      </div>
                    )) : (
                      <div className="py-8 text-center">
                        <ShieldCheck className="mx-auto mb-2 text-emerald-400" size={24} />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Cero alertas fiscales</p>
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
      </div>
    </header>
  );
}

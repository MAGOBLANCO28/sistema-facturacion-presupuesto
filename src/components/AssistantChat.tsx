import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, AlertTriangle, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  '¿Cómo creo mi primera factura?',
  '¿Qué diferencia hay entre factura y presupuesto?',
  '¿Para qué sirven los abonos?',
  '¿Cómo funciona el recordatorio de impuestos?',
  '¿Qué datos son obligatorios en una factura?',
];

const mdComponents = {
  p: ({ children }: any) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-black text-white">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-slate-300">{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc list-outside pl-4 mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-outside pl-4 mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li className="text-slate-200">{children}</li>,
  code: ({ children }: any) => <code className="px-1 py-0.5 bg-white/10 rounded text-purple-300 font-mono text-[10px]">{children}</code>,
  h1: ({ children }: any) => <p className="font-black text-white text-xs mb-1">{children}</p>,
  h2: ({ children }: any) => <p className="font-black text-white text-xs mb-1">{children}</p>,
  h3: ({ children }: any) => <p className="font-black text-slate-200 text-[11px] mb-1">{children}</p>,
};

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: '¡Hola! Soy el asistente de Faktio. Puedo ayudarte con cualquier duda sobre cómo usar la aplicación. ¿En qué te puedo ayudar?',
      }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const updated: Message[] = [...messages, { role: 'user', content: msg }];
    setMessages(updated);
    setLoading(true);
    try {
      const res = await authFetch('/api/assistant', {
        method: 'POST',
        body: JSON.stringify({ message: msg, history: messages }),
      });
      const data = await res.json();
      setMessages([...updated, {
        role: 'assistant',
        content: data.reply || 'Lo siento, no pude procesar tu consulta.',
      }]);
    } catch {
      setMessages([...updated, {
        role: 'assistant',
        content: 'Error de conexión. Por favor, inténtalo de nuevo.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        onClick={() => setOpen(!open)}
        aria-label="Abrir asistente"
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-[60] w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-500/30 border border-white/10 hover:scale-110 active:scale-95 transition-transform"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><X size={22} className="text-white" /></motion.span>
            : <motion.span key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><MessageCircle size={22} className="text-white" /></motion.span>
          }
        </AnimatePresence>
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed z-[60] flex flex-col bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden
              inset-x-3 bottom-[10rem] max-h-[65vh]
              lg:inset-x-auto lg:right-8 lg:left-auto lg:w-[360px] lg:bottom-[5.5rem] lg:max-h-[520px]"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 shrink-0 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shrink-0">
                  <Sparkles size={13} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-white text-sm leading-none">Asistente Faktio</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Orientación sobre el uso de la app</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/15 rounded-xl px-2.5 py-2">
                <AlertTriangle size={10} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-amber-300/70 font-bold leading-relaxed">
                  Este asistente ofrece orientación general sobre Faktio. No constituye asesoramiento fiscal ni legal. La responsabilidad de la exactitud de los datos fiscales recae siempre en el usuario o su asesor.
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-[11px] font-bold leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-sm'
                      : 'bg-white/5 border border-white/5 text-slate-300 rounded-bl-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick suggestions — solo con el saludo inicial */}
              {messages.length === 1 && !loading && (
                <div className="space-y-1.5 pt-1">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="w-full text-left px-3 py-2 text-[10px] font-bold text-slate-400 bg-white/3 border border-white/5 rounded-xl hover:bg-white/8 hover:text-slate-200 hover:border-white/10 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/5 shrink-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Escribe tu pregunta..."
                  className="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/5 rounded-xl outline-none focus:ring-1 focus:ring-purple-500/30 text-[11px] font-bold text-slate-200 placeholder:text-slate-600 transition-all"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded-xl flex items-center justify-center transition-all shrink-0"
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

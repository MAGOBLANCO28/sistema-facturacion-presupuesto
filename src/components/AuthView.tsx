import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  Delete,
  Lock,
  RefreshCw,
  Mail,
  Zap,
  Key,
  ChevronLeft,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldAlert
} from 'lucide-react';

interface Props {
    onLogin: (token: string, isNew?: boolean) => void;
}

const WORDS_POOL = ["alfa", "bravo", "delta", "ecos", "foxtrot", "golf", "hotel", "india", "julieta", "kilo", "lima", "mike", "noviembre", "oscar", "papa", "quebec", "romeo", "sierra", "tango", "uniforme", "victor", "whisky", "rayos", "zulu"];

export default function AuthView({ onLogin }: Props) {
    const [step, setStep] = useState<'auth' | 'pin' | 'seed' | 'verify_seed' | 'recover'>('auth');
    const [recoveryType, setRecoveryType] = useState<'pin' | 'password'>('pin');
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [seed, setSeed] = useState<string[]>([]);
    
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    
    const [recoveryIndices, setRecoveryIndices] = useState<number[]>([]);
    const [recoveryWords, setRecoveryWords] = useState<string[]>(['', '', '']);
    const [verifyIndex, setVerifyIndex] = useState<number>(0);
    const [verifyWord, setVerifyWord] = useState('');
    const [newTargetValue, setNewTargetValue] = useState(''); 
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [tempToken, setTempToken] = useState('');
    const [copied, setCopied] = useState(false);

    const cleanupSensitive = useCallback(() => {
        setPassword('');
        setPin('');
        setNewTargetValue('');
        setVerifyWord('');
        if (passwordRef.current) passwordRef.current.value = '';
    }, []);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const generateSeed = () => {
        const result = [];
        for (let i = 0; i < 12; i++) {
            result.push(WORDS_POOL[Math.floor(Math.random() * WORDS_POOL.length)]);
        }
        setSeed(result);
        setVerifyIndex(Math.floor(Math.random() * 12));
    };

    const handleInitialAuth = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Error de autenticación');
                cleanupSensitive();
                return;
            }
            setTempToken(data.token);
            if (data.hasPin || isLogin) { setStep('pin');
            } else { generateSeed(); setStep('seed'); }
        } catch { setError('Error de conexión Faktio Cloud'); } finally { setLoading(false); }
    };

    const prepareRecovery = useCallback(() => {
        const indices: number[] = [];
        while(indices.length < 3) {
            const r = Math.floor(Math.random() * 12);
            if (!indices.includes(r)) indices.push(r);
        }
        setRecoveryIndices(indices.sort((a,b) => a-b));
        setRecoveryWords(['', '', '']);
        setStep('recover');
        cleanupSensitive();
    }, [cleanupSensitive]);

    const handlePinSubmit = (digit: string) => {
        if (pin.length < 4) {
            const newPinVal = pin + digit;
            setPin(newPinVal);
            if (newPinVal.length === 4) {
                setTimeout(() => {
                    localStorage.setItem('token', tempToken);
                    onLogin(tempToken);
                }, 300);
            }
        }
    };

    const handleRecover = async () => {
        if (recoveryWords.some(w => !w)) return setError('Completa las 3 palabras');
        setError('');
        setLoading(true);
        try {
            const body = { email, indices: recoveryIndices, words: recoveryWords, ...(recoveryType === 'pin' ? { newPin: newTargetValue } : { newPassword: newTargetValue }) };
            const res = await fetch('/api/auth/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) return setError(data.error);
            setStep('auth');
            cleanupSensitive();
        } catch { setError('Error de red'); } finally { setLoading(false); }
    };

    const copyToClipboard = () => {
        const formatted = seed.map((w, i) => `${i + 1}. ${w}`).join(', ');
        navigator.clipboard.writeText(formatted);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleVerifySeed = () => {
        if (verifyWord.toLowerCase().trim() === seed[verifyIndex]) {
            localStorage.setItem('token', tempToken);
            onLogin(tempToken, true);
        } else {
            setError(`Palabra #${verifyIndex + 1} incorrecta`);
            setVerifyWord('');
        }
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-slate-950 font-sans">
            <style dangerouslySetInnerHTML={{ __html: `
                input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #020617 inset !important; -webkit-text-fill-color: white !important; }
            `}} />

            <div className="absolute inset-0 z-0">
                <div className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-slate-950 to-transparent blur-3xl opacity-40 shrink-0" />
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full flex justify-center">
                <div className="glass rounded-[3rem] shadow-[0_0_100px_rgba(168,85,247,0.1)] border border-white/5 p-8 w-full max-w-[360px] h-[600px] flex flex-col justify-between overflow-hidden relative">
                    <div className="flex flex-col items-center text-center">
                        <div className="relative mb-4 mt-2">
                            <div className="absolute inset-0 bg-purple-500 rounded-2xl blur-2xl opacity-20 animate-pulse" />
                            <img src="/logo-512.png" alt="Logo" className="relative w-16 h-16 object-contain" />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tighter leading-none mb-2">Faktio <span className="text-purple-400">2026</span></h1>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Deep Space Auth Node</p>
                    </div>

                    <div className="flex-1 flex flex-col justify-center py-2">
                        <AnimatePresence mode="wait">
                            {step === 'auth' && (
                                <motion.form key="auth" noValidate onSubmit={handleInitialAuth} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                                    <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5 mx-auto w-48 shadow-inner">
                                        <button type="button" onClick={() => { setIsLogin(true); cleanupSensitive(); }} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-white/10 text-white shadow-xl' : 'text-slate-600'}`}>Entrar</button>
                                        <button type="button" onClick={() => { setIsLogin(false); cleanupSensitive(); }} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-white/10 text-white shadow-xl' : 'text-slate-600'}`}>Alta</button>
                                    </div>

                                    <div className="space-y-3">
                                        <InputField ref={emailRef} icon={<Mail size={16} />} type="email" value={email} onChange={setEmail} placeholder="Email corporativo" autoComplete="username email" />
                                        <InputField ref={passwordRef} icon={<Lock size={16} />} type="password" value={password} onChange={setPassword} placeholder="Pass Maestra" autoComplete="current-password" showToggle />
                                        
                                        <div className="flex justify-center h-4">
                                            <button type="button" onClick={() => { setRecoveryType('password'); prepareRecovery(); }} className="text-[9px] font-black text-purple-400/40 uppercase tracking-widest hover:text-purple-400 transition-colors">¿Olvidaste tu contraseña?</button>
                                        </div>

                                        <button type="submit" disabled={loading} className="w-full py-5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
                                            {loading ? <RefreshCw className="animate-spin" size={18} /> : <span>Acceso Seguro</span>}
                                            {!loading && <ChevronRight size={18} />}
                                        </button>
                                    </div>
                                </motion.form>
                            )}

                            {step === 'pin' && (
                                <motion.div key="pin" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
                                    <h2 className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-[0.4em]">PIN de Identidad</h2>
                                    <div className="flex justify-center gap-4 mb-8">
                                        {[0, 1, 2, 3].map((i) => (
                                            <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-500 ${pin.length > i ? 'bg-purple-500 border-purple-500 shadow-[0_0_15px_#a855f7]' : 'border-white/10'}`} />
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                            <button key={n} onClick={() => handlePinSubmit(n.toString())} className="w-16 h-16 text-2xl font-black text-white rounded-2xl hover:bg-white/5 border border-white/5 flex items-center justify-center transition-all active:scale-90">
                                               {n}
                                            </button>
                                        ))}
                                        <div />
                                        <button onClick={() => handlePinSubmit('0')} className="w-16 h-16 text-2xl font-black text-white rounded-2xl hover:bg-white/5 border border-white/5 flex items-center justify-center transition-all active:scale-90">0</button>
                                        <button onClick={() => setPin(pin.slice(0, -1))} className="w-16 h-16 rounded-2xl hover:bg-white/5 flex items-center justify-center text-slate-700 hover:text-rose-400 transition-colors"><Delete size={24} /></button>
                                    </div>
                                    <button onClick={() => { setRecoveryType('pin'); prepareRecovery(); }} className="mt-8 text-[9px] font-black text-purple-400/40 uppercase tracking-widest hover:text-purple-400 transition-colors">¿Recuperar PIN?</button>
                                </motion.div>
                            )}

                            {step === 'seed' && (
                                <motion.div key="seed" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5 text-center">
                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                        <ShieldAlert className="text-emerald-400 mx-auto mb-2" size={22} />
                                        <h2 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mb-1">Frase de Recuperación</h2>
                                        <p className="text-[9px] text-slate-500 leading-tight font-bold">Guarda estas 12 palabras en un lugar seguro. Las necesitarás si olvidas tu contraseña o PIN.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 px-1">
                                        {seed.map((word, i) => (
                                            <div key={i} className="py-2 px-2 bg-white/5 border border-white/5 rounded-xl text-[10px] font-mono font-bold text-slate-300 text-left flex items-center shadow-inner">
                                                <span className="opacity-20 mr-1.5 text-[8px]">{i + 1}.</span> {word}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-2 pt-1">
                                        <button onClick={copyToClipboard} className="w-full py-2.5 bg-white/5 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/5 hover:text-white transition-all flex items-center justify-center gap-2">
                                            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar palabras'}
                                        </button>
                                        <button onClick={() => setStep('verify_seed')} className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] transition-all">He guardado la frase</button>
                                    </div>
                                </motion.div>
                            )}

                            {step === 'verify_seed' && (
                                <motion.div key="verify_seed" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-8 text-center">
                                    <div className="space-y-2">
                                        <h2 className="text-sm font-black text-white uppercase tracking-widest">Verificación</h2>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Escribe la palabra número <span className="text-purple-400">#{verifyIndex + 1}</span> de tu frase</p>
                                    </div>
                                    <div className="space-y-4">
                                        <input type="text" value={verifyWord} onChange={e => setVerifyWord(e.target.value)} className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 text-center font-black text-lg uppercase transition-all shadow-inner" placeholder="..." autoFocus />
                                        <button onClick={handleVerifySeed} className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-2xl">Confirmar y Entrar</button>
                                    </div>
                                </motion.div>
                            )}

                            {step === 'recover' && (
                                <motion.div key="recover" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                                    <button type="button" onClick={() => { setStep(recoveryType === 'pin' ? 'pin' : 'auth'); cleanupSensitive(); }} className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors"><ChevronLeft size={12} /> Retroceder</button>
                                    <div className="text-center">
                                       <h2 className="text-lg font-black text-white tracking-tighter uppercase">Recuperación</h2>
                                       <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Introduce 3 palabras de tu Semilla</p>
                                    </div>
                                    <div className="space-y-3">
                                        {recoveryIndices.map((idx, i) => (
                                            <div key={idx} className="relative group">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-purple-400/40 group-focus-within:text-purple-400">#{idx + 1}</span>
                                                <input type="text" value={recoveryWords[i]} onChange={e => { const nw = [...recoveryWords]; nw[i] = e.target.value; setRecoveryWords(nw); }} className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 text-[11px] font-bold shadow-inner" placeholder="..." />
                                            </div>
                                        ))}
                                        <div className="pt-2">
                                            <InputField icon={<Lock size={16} />} type="password" value={newTargetValue} onChange={setNewTargetValue} placeholder={recoveryType === 'pin' ? 'NUEVO PIN' : 'NUEVA PASS'} showToggle autoComplete="new-password" />
                                        </div>
                                        <button onClick={handleRecover} disabled={loading} className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl mt-4">Restablecer Bóveda</button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="h-4 flex items-center justify-center">
                        {error && <p className="text-[9px] text-rose-400 font-black uppercase tracking-widest animate-pulse">{error}</p>}
                    </div>

                    <div className="pt-4 border-t border-white/5 flex justify-center">
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 rounded-full border border-emerald-500/10 shadow-inner">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_#34d399]" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/60 leading-none">AES-512 Hyper-Cipher</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

const InputField = React.forwardRef(({ icon, type, value, onChange, placeholder, autoComplete, showToggle }: any, ref: any) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const finalType = showToggle ? (isVisible ? 'text' : 'password') : type;

    return (
        <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-purple-400 transition-colors">{icon}</div>
            <input 
                ref={ref} type={finalType} value={value} onChange={e => onChange(e.target.value)} 
                autoComplete={autoComplete} readOnly={isReadOnly} 
                onFocus={() => setIsReadOnly(false)} onBlur={() => setIsReadOnly(true)} 
                className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 transition-all text-sm font-bold placeholder:text-slate-800 shadow-inner" 
                placeholder={placeholder} 
            />
            {showToggle && (
                <button type="button" onClick={() => setIsVisible(!isVisible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700 hover:text-white transition-colors">
                   {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            )}
        </div>
    );
});
InputField.displayName = 'InputField';
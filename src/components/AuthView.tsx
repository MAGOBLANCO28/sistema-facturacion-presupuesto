import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight, Delete, Lock, RefreshCw, Mail,
  ChevronLeft, Copy, Check, Eye, EyeOff, ShieldCheck,
  Info, X, AlertTriangle
} from 'lucide-react';

interface Props {
  onLogin: (token: string, isNew?: boolean) => void;
}

const WORDS_POOL = ["alfa","bravo","delta","ecos","foxtrot","golf","hotel","india","julieta","kilo","lima","mike","noviembre","oscar","papa","quebec","romeo","sierra","tango","uniforme","victor","whisky","rayos","zulu"];

export default function AuthView({ onLogin }: Props) {
  const [step, setStep] = useState<'auth'|'pin'|'seed'|'verify_seed'|'create_pin'|'recover'>('auth');
  const [recoveryType, setRecoveryType] = useState<'pin'|'password'>('pin');
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [seed, setSeed] = useState<string[]>([]);
  const [showSeedInfo, setShowSeedInfo] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [recoveryIndices, setRecoveryIndices] = useState<number[]>([]);
  const [recoveryWords, setRecoveryWords] = useState<string[]>(['','','']);
  const [verifyIndex, setVerifyIndex] = useState(0);
  const [verifyWord, setVerifyWord] = useState('');
  const [newTargetValue, setNewTargetValue] = useState('');
  const [newPinReg, setNewPinReg] = useState('');
  const [confirmPinReg, setConfirmPinReg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  const cleanupSensitive = useCallback(() => {
    setPassword(''); setPin(''); setNewTargetValue(''); setVerifyWord('');
    if (passwordRef.current) passwordRef.current.value = '';
  }, []);

  const generateSeed = () => {
    const result: string[] = [];
    for (let i = 0; i < 12; i++) result.push(WORDS_POOL[Math.floor(Math.random() * WORDS_POOL.length)]);
    setSeed(result);
    setVerifyIndex(Math.floor(Math.random() * 12));
  };

  const handleInitialAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error de autenticación'); cleanupSensitive(); return; }
      setTempToken(data.token);
      if (!isLogin) { generateSeed(); setStep('seed'); }
      else if (data.hasPin) { setStep('pin'); }
      else { localStorage.setItem('token', data.token); onLogin(data.token); }
    } catch { setError('Error de conexión con el servidor'); } finally { setLoading(false); }
  };

  const prepareRecovery = useCallback(() => {
    const indices: number[] = [];
    while (indices.length < 3) {
      const r = Math.floor(Math.random() * 12);
      if (!indices.includes(r)) indices.push(r);
    }
    setRecoveryIndices(indices.sort((a, b) => a - b));
    setRecoveryWords(['','','']);
    setStep('recover');
    cleanupSensitive();
  }, [cleanupSensitive]);

  const handlePinSubmit = async (digit: string) => {
    if (pin.length >= 4 || loading) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempToken}` },
          body: JSON.stringify({ pin: newPin }),
        });
        if (!res.ok) {
          setTimeout(() => { setPin(''); setError('PIN incorrecto. Inténtalo de nuevo.'); setLoading(false); }, 400);
          return;
        }
        localStorage.setItem('token', tempToken);
        onLogin(tempToken);
      } catch {
        setPin(''); setError('Error de conexión'); setLoading(false);
      }
    }
  };

  const handleRecover = async () => {
    if (recoveryWords.some(w => !w)) return setError('Completa las 3 palabras de recuperación');
    setError(''); setLoading(true);
    try {
      const body = {
        email, indices: recoveryIndices, words: recoveryWords,
        ...(recoveryType === 'pin' ? { newPin: newTargetValue } : { newPassword: newTargetValue }),
      };
      const res = await fetch('/api/auth/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Palabras incorrectas o email no válido');
      setStep('auth'); cleanupSensitive();
      setError('');
    } catch { setError('Error de red'); } finally { setLoading(false); }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(seed.map((w, i) => `${i + 1}. ${w}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifySeed = async () => {
    if (verifyWord.toLowerCase().trim() !== seed[verifyIndex]) {
      setError(`Palabra #${verifyIndex + 1} incorrecta. Revisa tu frase.`);
      setVerifyWord('');
      return;
    }
    setLoading(true);
    try {
      await fetch('/api/auth/seed/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempToken}` },
        body: JSON.stringify({ seed: seed.join(' ') }),
      });
      setStep('create_pin');
    } catch {
      setError('Error al guardar la frase. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePin = async () => {
    setError('');
    if (newPinReg.length !== 4) return setError('El PIN debe tener exactamente 4 dígitos');
    if (newPinReg !== confirmPinReg) return setError('Los PINs no coinciden');
    setLoading(true);
    try {
      await fetch('/api/auth/pin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempToken}` },
        body: JSON.stringify({ currentPin: '', newPin: newPinReg }),
      });
      localStorage.setItem('token', tempToken);
      onLogin(tempToken, true);
    } catch {
      setError('Error al guardar el PIN. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const stepSubtitle: Record<string, string> = {
    auth: 'Deep Space Auth Node',
    pin: 'Introduce tu PIN de 4 dígitos',
    seed: 'Seguridad de Cuenta',
    verify_seed: 'Confirma tu Frase',
    create_pin: 'Crea tu PIN de Acceso',
    recover: recoveryType === 'pin' ? 'Recuperar PIN' : 'Recuperar Contraseña',
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-slate-950 font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #020617 inset !important; -webkit-text-fill-color: white !important; }
      `}} />

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-slate-950 to-transparent blur-3xl opacity-40" />
      </div>

      {/* Modal info — Frase de recuperación */}
      <AnimatePresence>
        {showSeedInfo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowSeedInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck size={16} className="text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-black text-white">Frase de Recuperación</h3>
                </div>
                <button onClick={() => setShowSeedInfo(false)} className="w-7 h-7 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">¿Qué son estas palabras?</p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Son 12 palabras únicas que identifican tu cuenta. Funcionan como una llave maestra que solo tú debes conocer.
                  </p>
                </div>

                <div className="p-3 bg-purple-500/5 border border-purple-500/15 rounded-2xl">
                  <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-1.5">¿Para qué sirven?</p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Si olvidas tu contraseña o PIN, el sistema te pedirá <span className="text-white font-black">3 palabras aleatorias</span> de tu frase para verificar que eres tú.
                  </p>
                </div>

                <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-2xl">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1.5">Cómo guardarlas (importante)</p>
                      <ul className="text-[11px] text-slate-300 leading-relaxed space-y-1">
                        <li>✓ Escríbelas en papel y guárdalas bajo llave</li>
                        <li>✗ Nunca las envíes por email o WhatsApp</li>
                        <li>✗ No las guardes en notas del móvil sin cifrar</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowSeedInfo(false)}
                className="w-full mt-5 py-3 bg-white/10 border border-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white/15 transition-all"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card principal */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full flex justify-center">
        <div className="glass rounded-[3rem] shadow-[0_0_100px_rgba(168,85,247,0.1)] border border-white/5 p-8 w-full max-w-[360px] h-[600px] flex flex-col justify-between overflow-hidden relative">

          {/* Header */}
          <div className="flex flex-col items-center text-center shrink-0">
            <div className="relative mb-4 mt-2">
              <div className="absolute inset-0 bg-purple-500 rounded-2xl blur-2xl opacity-20 animate-pulse" />
              <img src="/logo-512.png" alt="Faktio" className="relative w-16 h-16 object-contain" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter leading-none mb-2">
              Faktio <span className="text-purple-400">2026</span>
            </h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
              {stepSubtitle[step]}
            </p>
          </div>

          {/* Contenido */}
          <div className="flex-1 flex flex-col justify-center py-2 min-h-0">
            <AnimatePresence mode="wait">

              {/* ── INICIO DE SESIÓN / REGISTRO ── */}
              {step === 'auth' && (
                <motion.form key="auth" noValidate onSubmit={handleInitialAuth}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                  className="space-y-5"
                >
                  <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5 mx-auto w-48 shadow-inner">
                    <button type="button" onClick={() => { setIsLogin(true); cleanupSensitive(); }}
                      className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-white/10 text-white shadow-xl' : 'text-slate-600'}`}>
                      Entrar
                    </button>
                    <button type="button" onClick={() => { setIsLogin(false); cleanupSensitive(); }}
                      className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-white/10 text-white shadow-xl' : 'text-slate-600'}`}>
                      Alta
                    </button>
                  </div>

                  <div className="space-y-3">
                    <InputField ref={emailRef} icon={<Mail size={16} />} type="email" value={email} onChange={setEmail} placeholder="Email corporativo" autoComplete="username email" />
                    <InputField ref={passwordRef} icon={<Lock size={16} />} type="password" value={password} onChange={setPassword} placeholder="Contraseña maestra" autoComplete="current-password" showToggle />
                    <div className="flex justify-center h-5">
                      <button type="button" onClick={() => { setRecoveryType('password'); prepareRecovery(); }}
                        className="text-[9px] font-black text-purple-400/40 uppercase tracking-widest hover:text-purple-400 transition-colors">
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    {!isLogin && (
                      <label className="flex items-start gap-3 cursor-pointer">
                        <div className="relative mt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={acceptedPrivacy}
                            onChange={e => setAcceptedPrivacy(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded-md border transition-all ${acceptedPrivacy ? 'bg-purple-500 border-purple-500' : 'border-white/20 bg-white/5'} flex items-center justify-center`}>
                            {acceptedPrivacy && <Check size={10} className="text-white" />}
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-500 leading-relaxed font-bold">
                          He leído y acepto la{' '}
                          <a href="/politicas.html" target="_blank" rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                            onClick={e => e.stopPropagation()}>
                            Política de Privacidad
                          </a>
                          {' '}y el tratamiento de mis datos conforme al RGPD
                        </p>
                      </label>
                    )}
                    <button type="submit" disabled={loading || (!isLogin && !acceptedPrivacy)}
                      className="w-full py-5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                      {loading
                        ? <RefreshCw className="animate-spin" size={18} />
                        : <><span>Acceso Seguro</span><ChevronRight size={18} /></>}
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── PIN ── */}
              {step === 'pin' && (
                <motion.div key="pin"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center"
                >
                  <div className="flex justify-center gap-4 mt-3 mb-5">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${
                        loading ? 'bg-purple-500/50 border-purple-500/50' :
                        pin.length > i ? 'bg-purple-500 border-purple-500 shadow-[0_0_15px_#a855f7]' : 'border-white/10'
                      }`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6,7,8,9].map(n => (
                      <button key={n} onClick={() => handlePinSubmit(n.toString())}
                        disabled={loading || pin.length >= 4}
                        className="w-[58px] h-[58px] text-xl font-black text-white rounded-2xl hover:bg-white/5 border border-white/5 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
                        {n}
                      </button>
                    ))}
                    <div />
                    <button onClick={() => handlePinSubmit('0')}
                      disabled={loading || pin.length >= 4}
                      className="w-[58px] h-[58px] text-xl font-black text-white rounded-2xl hover:bg-white/5 border border-white/5 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
                      0
                    </button>
                    <button onClick={() => setPin(pin.slice(0, -1))}
                      className="w-[58px] h-[58px] rounded-2xl hover:bg-white/5 flex items-center justify-center text-slate-700 hover:text-rose-400 transition-colors">
                      <Delete size={22} />
                    </button>
                  </div>
                  <button onClick={() => { setRecoveryType('pin'); prepareRecovery(); }}
                    className="mt-4 text-[9px] font-black text-purple-400/40 uppercase tracking-widest hover:text-purple-400 transition-colors">
                    ¿Olvidaste tu PIN?
                  </button>
                </motion.div>
              )}

              {/* ── FRASE DE RECUPERACIÓN ── */}
              {step === 'seed' && (
                <motion.div key="seed"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Frase de recuperación</p>
                      <p className="text-[9px] text-slate-600 mt-0.5">Guarda estas 12 palabras en un lugar seguro</p>
                    </div>
                    <button onClick={() => setShowSeedInfo(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400 hover:bg-amber-500/25 transition-all animate-pulse shrink-0"
                      title="Información importante">
                      <Info size={11} />
                      <span className="text-[8px] font-black uppercase tracking-wider">Leer</span>
                    </button>
                  </div>

                  {/* Grid 4 columnas — más compacto */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {seed.map((word, i) => (
                      <div key={i} className="py-1.5 px-2 bg-white/5 border border-white/5 rounded-xl flex items-center gap-1 shadow-inner overflow-hidden">
                        <span className="text-[7px] text-slate-600 shrink-0 leading-none">{i+1}.</span>
                        <span className="text-[9px] font-mono font-bold text-slate-300 truncate leading-none">{word}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-1">
                    <button onClick={copyToClipboard}
                      className="w-full py-2.5 bg-white/5 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/5 hover:text-white transition-all flex items-center justify-center gap-2">
                      {copied ? <><Check size={12} className="text-emerald-400" />Copiado</> : <><Copy size={12} />Copiar palabras</>}
                    </button>
                    <button onClick={() => setStep('verify_seed')}
                      className="w-full py-3.5 bg-white text-slate-950 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                      He guardado la frase →
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── VERIFICAR FRASE ── */}
              {step === 'verify_seed' && (
                <motion.div key="verify_seed"
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                  className="space-y-6 text-center"
                >
                  <div className="space-y-3">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Escribe la palabra número</p>
                    <div className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                      <span className="text-2xl font-black text-purple-400">#{verifyIndex + 1}</span>
                    </div>
                    <p className="text-[9px] text-slate-600">de tu frase de recuperación</p>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text" value={verifyWord}
                      onChange={e => setVerifyWord(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleVerifySeed()}
                      className="w-full px-6 py-4 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 text-center font-black text-lg uppercase tracking-widest transition-all shadow-inner placeholder:text-slate-700"
                      placeholder="..."
                      autoFocus
                    />
                    <button onClick={handleVerifySeed}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">
                      Confirmar y Entrar
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── CREAR PIN (REGISTRO) ── */}
              {step === 'create_pin' && (
                <motion.div key="create_pin"
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                  className="space-y-5"
                >
                  <div className="text-center space-y-1">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                      Último paso — crea tu PIN de 4 dígitos
                    </p>
                    <p className="text-[9px] text-slate-600">Lo necesitarás cada vez que inicies sesión</p>
                  </div>
                  <div className="space-y-3">
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-purple-400 transition-colors">
                        <Lock size={16} />
                      </div>
                      <input
                        type="password" maxLength={4} value={newPinReg}
                        onChange={e => setNewPinReg(e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 transition-all font-black text-center tracking-[0.6em] text-lg placeholder:text-slate-800 shadow-inner"
                        placeholder="• • • •"
                        autoFocus
                      />
                    </div>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-purple-400 transition-colors">
                        <Lock size={16} />
                      </div>
                      <input
                        type="password" maxLength={4} value={confirmPinReg}
                        onChange={e => setConfirmPinReg(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => e.key === 'Enter' && handleCreatePin()}
                        className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 transition-all font-black text-center tracking-[0.6em] text-lg placeholder:text-slate-800 shadow-inner"
                        placeholder="Confirmar PIN"
                      />
                    </div>
                    <button onClick={handleCreatePin} disabled={loading}
                      className="w-full py-5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                      {loading ? <RefreshCw className="animate-spin" size={18} /> : <><span>Activar cuenta</span><ChevronRight size={18} /></>}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── RECUPERACIÓN ── */}
              {step === 'recover' && (
                <motion.div key="recover"
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                  className="flex flex-col h-full"
                >
                  <button type="button" onClick={() => { setStep(recoveryType === 'pin' ? 'pin' : 'auth'); cleanupSensitive(); }}
                    className="flex items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors mb-4 self-start">
                    <ChevronLeft size={12} /> Volver
                  </button>
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                  <div className="text-center">
                    <h2 className="text-base font-black text-white tracking-tight">
                      {recoveryType === 'pin' ? 'Recuperar PIN' : 'Recuperar Contraseña'}
                    </h2>
                    <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mt-1">
                      Introduce 3 palabras de tu frase
                    </p>
                  </div>
                  <div className="space-y-2">
                    {recoveryIndices.map((idx, i) => (
                      <div key={idx} className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-purple-400/50 group-focus-within:text-purple-400 transition-colors">
                          #{idx + 1}
                        </span>
                        <input
                          type="text" value={recoveryWords[i]}
                          onChange={e => { const nw = [...recoveryWords]; nw[i] = e.target.value; setRecoveryWords(nw); }}
                          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 text-[11px] font-bold shadow-inner placeholder:text-slate-700"
                          placeholder="Palabra..."
                        />
                      </div>
                    ))}
                    <div className="pt-1">
                      <InputField icon={<Lock size={16} />} type="password" value={newTargetValue} onChange={setNewTargetValue}
                        placeholder={recoveryType === 'pin' ? 'Nuevo PIN (4 dígitos)' : 'Nueva contraseña'} showToggle autoComplete="new-password" />
                    </div>
                    <button onClick={handleRecover} disabled={loading}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                      {loading ? <RefreshCw className="animate-spin" size={16} /> : 'Restablecer acceso'}
                    </button>
                  </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Error */}
          <div className="h-5 shrink-0 flex items-center justify-center">
            {error && (
              <p className="text-[9px] text-rose-400 font-black uppercase tracking-widest animate-pulse text-center leading-tight">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-white/5 shrink-0 flex justify-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 rounded-full border border-emerald-500/10">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_#34d399]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/60 leading-none">Conexión Cifrada · JWT · bcrypt</span>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}

/* ── Input Field ──────────────────────────────── */
const InputField = React.forwardRef(({ icon, type, value, onChange, placeholder, autoComplete, showToggle }: any, ref: any) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const finalType = showToggle ? (isVisible ? 'text' : 'password') : type;

  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-purple-400 transition-colors">
        {icon}
      </div>
      <input
        ref={ref} type={finalType} value={value} onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete} readOnly={isReadOnly}
        onFocus={() => setIsReadOnly(false)} onBlur={() => setIsReadOnly(true)}
        className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/5 rounded-2xl text-white outline-none focus:bg-white/10 transition-all text-sm font-bold placeholder:text-slate-800 shadow-inner"
        placeholder={placeholder}
      />
      {showToggle && (
        <button type="button" onClick={() => setIsVisible(!isVisible)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700 hover:text-white transition-colors">
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  );
});
InputField.displayName = 'InputField';

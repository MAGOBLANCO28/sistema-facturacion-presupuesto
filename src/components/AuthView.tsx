import { useState } from 'react';

interface Props {
    onLogin: (token: string) => void;
}

export default function AuthView({ onLogin }: Props) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
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
            if (!res.ok) return setError(data.error || 'Error desconocido');
            localStorage.setItem('token', data.token);
            onLogin(data.token);
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-10 w-full max-w-md">

                <div className="flex flex-col items-center mb-8">
                    <div className="w-14 h-14 mb-3">
                        <svg viewBox="0 0 100 100" className="w-full h-full text-red-700" fill="currentColor">
                            <path d="M35 35 L35 80 L55 80 L55 20 L45 20 L45 50 L35 50 Z" />
                            <rect x="60" y="20" width="25" height="5" />
                            <rect x="65" y="35" width="20" height="5" />
                            <rect x="70" y="50" width="15" height="30" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-black text-red-700 tracking-tight">Faktio</h1>
                    <p className="text-xs text-zinc-400 uppercase tracking-widest mt-1">Facturación profesional para autónomos</p>
                </div>

                <div className="flex rounded-xl overflow-hidden border border-zinc-200 mb-6">
                    <button
                        onClick={() => setIsLogin(true)}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${isLogin ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                    >
                        Iniciar sesión
                    </button>
                    <button
                        onClick={() => setIsLogin(false)}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!isLogin ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                    >
                        Registrarse
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-zinc-600 block mb-1.5">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="tu@email.com"
                            className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-zinc-600 block mb-1.5">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg">{error}</p>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !email || !password}
                        className="w-full py-3 bg-red-700 text-white rounded-xl font-bold hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Cargando...' : isLogin ? 'Entrar' : 'Crear cuenta'}
                    </button>
                </div>
            </div>
        </div>
    );
}
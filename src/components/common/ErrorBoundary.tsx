import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State { hasError: boolean; error: string }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-8">
          <div className="text-center space-y-6 max-w-sm">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-center mx-auto">
              <AlertTriangle className="text-rose-400" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white mb-2">Error inesperado</h2>
              <p className="text-sm text-slate-400 font-bold leading-relaxed">{this.state.error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-3 mx-auto px-6 py-3 bg-purple-600 text-white rounded-2xl font-black text-sm hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20"
            >
              <RefreshCw size={16} /> Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

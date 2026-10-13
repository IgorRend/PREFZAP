import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ComponentErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Component Error Boundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      
      return (
        <div className="flex flex-col items-center justify-center h-full p-10 text-muted-foreground text-center">
          <AlertTriangle size={44} className="text-destructive mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Algo deu errado neste módulo</h2>
          <p className="text-sm mb-5 max-w-[400px]">{this.state.error?.message || 'Erro interno no componente.'}</p>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

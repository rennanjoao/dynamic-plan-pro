import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Loga a stack do componente também — sem isso, um erro capturado aqui
    // só mostra a mensagem, sem pista de qual árvore de componentes falhou.
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }
  // Reset "suave": tenta re-renderizar a árvore sem recarregar a página
  // inteira, para não zerar estado que não tinha relação com o erro (ex.
  // outro componente irmão que ainda tinha progresso não salvo). Se o erro
  // persistir, a árvore simplesmente cai de novo no fallback.
  handleRetry = () => {
    this.setState({ hasError: false });
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center space-y-3">
            <h2 className="text-lg font-bold text-foreground">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground">
              {this.props.label ?? "Recarregue a página para continuar."}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={this.handleRetry} variant="outline">Tentar novamente</Button>
              <Button onClick={() => window.location.reload()}>Recarregar</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

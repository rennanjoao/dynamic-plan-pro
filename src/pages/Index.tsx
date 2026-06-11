import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, Dumbbell, UtensilsCrossed, ArrowRight, Zap, Shield, TrendingUp, Sparkles, Key } from "lucide-react";
import { motion } from "framer-motion";
import { InfoChatBot } from "@/components/landing/InfoChatBot";

const FeatureCard = ({ icon: Icon, title, description, delay }: { icon: any; title: string; description: string; delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="glass rounded-2xl p-6 card-hover group"
  >
    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:glow-primary transition-all duration-500">
      <Icon className="w-6 h-6 text-primary" />
    </div>
    <h3 className="font-bold text-lg text-foreground mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
  </motion.div>
);

const StatBlock = ({ value, label, noTranslate }: { value: string; label: string; noTranslate?: boolean }) => (
  <div className="text-center">
    <p className="text-3xl font-extrabold text-gradient" translate={noTranslate ? "no" : undefined}>{value}</p>
    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
  </div>
);

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative">

      {/* ─── SPLASH SCREEN ─── */}
      <style>{`
        @keyframes splashOut {
          0% { opacity: 1; pointer-events: all; }
          99% { opacity: 0; pointer-events: all; }
          100% { opacity: 0; visibility: hidden; pointer-events: none; display: none; }
        }
      `}</style>
      <div
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 2147483647, backgroundColor: "#0B0B0C", color: "#F5F5F5",
          display: "flex", flexDirection: "column", alignItems: "center", justifyItems: "center", justifyContent: "center",
          padding: "32px", textAlign: "center", cursor: "pointer",
          fontFamily: "system-ui, -apple-system, sans-serif",
          animation: "splashOut 0.5s ease forwards 5.5s"
        }}
        onClick={(e) => e.currentTarget.style.display = "none"}
      >
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "#B11226", marginBottom: "24px" }}>
          Elite Hub
        </div>
        <div style={{ width: "1px", height: "48px", backgroundColor: "#B11226", marginBottom: "32px" }} />
        <h1 style={{ fontFamily: "serif", fontWeight: 700, fontSize: "clamp(2rem, 8vw, 3.5rem)", lineHeight: 1.1, margin: 0 }}>
          Bem-vindo à sua
        </h1>
        <h2 style={{ fontFamily: "serif", fontWeight: 700, fontStyle: "italic", color: "#B11226", fontSize: "clamp(2rem, 8vw, 3.5rem)", lineHeight: 1.1, marginBottom: "32px" }}>
          nova fase.
        </h2>
        <p style={{ fontSize: "14px", color: "#8B8B92", lineHeight: 1.6, maxWidth: "340px", marginBottom: "48px" }}>
          Este é o ponto de partida para uma transformação construída com estratégia, acompanhamento e comprometimento.
          <br /><br />
          Nós fornecemos o caminho. Você constrói o resultado.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#55555C" }}>
          <Sparkles size={16} color="#B11226" /> Toque para começar <div style={{ width: "28px", height: "1px", backgroundColor: "#55555C" }} />
        </div>
        <div style={{ position: "absolute", bottom: "32px", fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", color: "#55555C" }}>
          By Rennan João
        </div>
      </div>
      {/* ─── FIM DO SPLASH SCREEN ─── */}

      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-90 dark:opacity-100" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(350_89%_50%/0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(350_89%_50%/0.06),transparent_50%)]" />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-24 md:py-32">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-8">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-foreground dark:text-white/80">Rennan João · Performance Coaching</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black text-foreground dark:text-white mb-10 tracking-tighter">
              Elite Prime <span className="text-primary">Hub</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground dark:text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
              Plataforma de acompanhamento técnico para alunos em busca de evolução real em treino, nutrição e saúde.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/* NOVO ALUNO: Vai direto validar o código e preencher a ficha */}
              <Link to="/anamnesis" className="w-full sm:w-auto">
                <Button size="lg" className="w-full gap-2 rounded-xl px-8 h-14 text-base font-bold glow-primary">
                  <Key className="w-5 h-5" />
                  Primeiro Acesso (Código)
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              {/* ALUNO EXISTENTE: Vai pro login normal */}
              <Link to="/auth" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full gap-2 rounded-xl px-8 h-14 text-base font-bold border-border/50 hover:bg-primary/10 hover:border-primary/30 bg-background/50 backdrop-blur-sm">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  Já sou aluno (Login)
                </Button>
              </Link>
            </div>
            
            {/* COACH: Login Administrativo */}
            <div className="mt-8">
              <Link to="/admin-login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors tracking-widest uppercase">
                <Shield className="w-3.5 h-3.5" />
                Acesso Treinador
              </Link>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }} className="glass rounded-2xl p-8 mt-16 max-w-3xl mx-auto border border-border/30">
            <div className="grid grid-cols-3 gap-8">
              <StatBlock value="10+" label="Modalidades" />
              <StatBlock value="100%" label="Personalizado" />
              <StatBlock value="24/7" label="Acesso" noTranslate />
            </div>
          </motion.div>
        </div>
      </header>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-3">Recursos Premium</h2>
          <p className="text-muted-foreground">Tudo que você precisa para resultados de elite</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard icon={Dumbbell} title="Treinos Inteligentes" description="Protocolos personalizados com RPE, cadência, séries, descanso e métricas de evolução. Desenvolvido para coaches, atletas e alunos de qualquer modalidade."
 delay={0.1} />
          <FeatureCard icon={UtensilsCrossed} title="Estratégias Nutricionais" description="Diretrizes e recomendações alimentares para apoiar seus objetivos de emagrecimento, saúde e performance." delay={0.2} />
          <FeatureCard icon={TrendingUp} title="Painel de Evolução" description="Visualize sua evolução através de métricas corporais, registros fotográficos e indicadores de performance ao longo do processo." delay={0.3} />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12">
        <div className="glass rounded-2xl p-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Shield className="w-4 h-4 text-primary" />
          <span>Dados protegidos com criptografia e Row Level Security</span>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8 text-center">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Elite Prime Hub — Rennan João</p>
      </footer>

      <InfoChatBot />
    </div>
  );
};

export default Index;

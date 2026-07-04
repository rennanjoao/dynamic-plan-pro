// src/pages/ReferralWelcome.tsx
// Landing page dedicada para novos alunos vindos de convite de coach
// Foco em conversão e boas-vindas personalizadas

import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { CheckCircle2, Flame, Rocket, Trophy } from "lucide-react";

const GOLD = "#C9A84C";

export default function ReferralWelcome() {
  const { coachId } = useParams<{ coachId: string }>();
  const navigate = useNavigate();
  const [coach, setCoach] = useState<{ name: string; team_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoach = async () => {
      if (!coachId) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, team_name")
          .eq("id", coachId)
          .single();

        if (data) {
          setCoach({
            name: data.full_name || "Coach",
            team_name: data.team_name,
          });
        }
      } catch (err) {
        console.error("Error fetching coach:", err);
      } finally {
        setLoading(false);
      }
    };

    void fetchCoach();
  }, [coachId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-primary selection:text-white">
      {/* ── Background Decorativo ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full opacity-20 blur-[120px]"
          style={{ background: "rgba(204,0,0,0.4)" }}
        />
        <div 
          className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full opacity-10 blur-[120px]"
          style={{ background: GOLD }}
        />
      </div>

      <main className="relative z-10 max-w-lg mx-auto px-6 py-16 flex flex-col items-center min-h-screen">
        {/* Logo/Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-2xl shadow-red-600/20 mb-8"
        >
          <Trophy className="w-10 h-10 text-white" />
        </motion.div>

        {/* Hero Section */}
        <div className="text-center space-y-4 mb-12">
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-4xl font-black tracking-tight leading-tight"
          >
            {coach?.name ? (
              <>Você foi convidado por <span style={{ color: GOLD }}>{coach.name}</span></>
            ) : (
              <>Bem-vindo ao <span className="text-red-600">Dynamic Plan Pro</span></>
            )}
          </motion.h1>
          
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-white/60 font-medium"
          >
            A plataforma definitiva para quem busca performance real e consistência inabalável.
          </motion.p>
        </div>

        {/* Benefits Grid */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full grid grid-cols-1 gap-4 mb-12"
        >
          {[
            { icon: <Flame className="w-5 h-5" />, title: "Treinos Dinâmicos", desc: "Protocolos que evoluem com você." },
            { icon: <Rocket className="w-5 h-5" />, title: "Alta Performance", desc: "Ferramentas de elite para coaches e alunos." },
            { icon: <CheckCircle2 className="w-5 h-5" />, title: "Consistência", desc: "Gamificação e tracking de PRs em tempo real." }
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="shrink-0 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-red-500">
                {b.icon}
              </div>
              <div>
                <h3 className="font-bold text-sm">{b.title}</h3>
                <p className="text-xs text-white/40">{b.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTA Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="w-full space-y-4 mt-auto"
        >
          <button
            onClick={() => navigate(`/register?invite=${coachId || ""}`)}
            className="w-full py-5 bg-white text-black font-black text-lg rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Começar Agora
          </button>
          
          <p className="text-[10px] text-center text-white/30 uppercase tracking-[0.2em] font-bold">
            Sem cartão de crédito · Acesso imediato
          </p>
        </motion.div>

        {coach?.team_name && (
          <p className="mt-8 text-xs font-bold text-white/20 uppercase tracking-widest">
            {coach.team_name}
          </p>
        )}
      </main>
    </div>
  );
}

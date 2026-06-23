import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Sparkles, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AthleteContext {
  name?: string;
  isCoach?: boolean;
  goal?: string;
  weight?: number;
  bodyFat?: number;
  protocol?: string;
  trainingVolume?: string;
}

interface FitnessChatBotProps {
  athleteContext?: AthleteContext;
  onOpen?: () => void;
  proactiveMessage?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fitness-chat`;
const BUBBLE_DURATION = 6000;
const SESSION_KEY = "fitness-chat-session";

const STUDENT_QUICK_ACTIONS = [
  { label: "Check-in pendente?", prompt: "Verifique no meu histórico se tenho check-in pendente ou atrasado e me diga o que está faltando." },
  { label: "Ajustar Macros", prompt: "Me ajude a ajustar meus macronutrientes com base no meu perfil e objetivo atual." },
  { label: "Minha Evolução", prompt: "Gere um resumo da minha evolução com base nas minhas medidas e check-ins." },
  { label: "Técnica Agachamento", prompt: "Explique a técnica correta do agachamento com barra, incluindo cadência e RPE ideal." },
];

const COACH_QUICK_ACTIONS = [
  { label: "Como usar o Builder", prompt: "Me explique como construir um protocolo de dieta completo para um aluno na plataforma, do zero." },
  { label: "Analisar Check-in", prompt: "Com base nos check-ins recentes dos meus alunos, quem tem feedback pendente e o que devo priorizar?" },
  { label: "Sugerir Substituições", prompt: "Quais são boas substituições proteicas para um aluno com intolerância a lactose e que não gosta de atum?" },
];

const DEFAULT_WELCOME = "Olá, sou o agente virtual da Elite Hub. Como posso ajudar?";

const INITIAL_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: DEFAULT_WELCOME,
};

export const FitnessChatBot = ({ athleteContext, onOpen, proactiveMessage }: FitnessChatBotProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState(DEFAULT_WELCOME);
  const [minimized, setMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restaura mensagens da sessão (uma vez)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Message[];
      if (Array.isArray(parsed) && parsed.length > 1) {
        setMessages(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Persiste mensagens na sessão
  useEffect(() => {
    if (messages.length > 1) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
    }
  }, [messages]);

  // Mensagem proativa vinda do contexto global
  useEffect(() => {
    if (!proactiveMessage) return;
    if (isOpen || showBubble) return;
    setBubbleText(proactiveMessage);
    setShowBubble(true);
    const t = setTimeout(() => setShowBubble(false), BUBBLE_DURATION);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proactiveMessage]);

  useEffect(() => {
    if (messages.length === 1 && messages[0].id === "welcome") {
      const text = athleteContext?.name
        ? `Olá ${athleteContext.name.split(" ")[0]}, sou o agente virtual da Elite Hub. Estou aqui para te ajudar com a plataforma!`
        : DEFAULT_WELCOME;
      setBubbleText(text);
      setMessages([{ id: "welcome", role: "assistant", content: text }]);
      setShowBubble(true);
      const timer = setTimeout(() => setShowBubble(false), BUBBLE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [athleteContext?.name]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = async (allMessages: { role: string; content: string }[]) => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: allMessages, athleteContext }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Erro de conexão" }));
      if (resp.status === 429) toast.error("Limite de requisições excedido. Aguarde.");
      else if (resp.status === 402) toast.error("Créditos de IA esgotados.");
      else toast.error(err.error || "Erro ao conectar com IA");
      throw new Error(err.error);
    }

    if (!resp.body) throw new Error("No stream body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantSoFar = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") { streamDone = true; break; }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantSoFar += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.id !== "welcome") {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
              }
              return [...prev, { id: Date.now().toString(), role: "assistant", content: assistantSoFar }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
  };

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const history = [...messages.filter(m => m.id !== "welcome"), userMsg].map(m => ({
      role: m.role, content: m.content,
    }));

    try {
      await streamChat(history);
    } catch {
      // error already toasted
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = () => {
    setShowBubble(false);
    setIsOpen(true);
    onOpen?.(); // dispara o fetch do contexto (perfil/alunos/check-ins) só agora
  };

  return (
    <>
      {/* Bubble flutuante de boas-vindas */}
      <AnimatePresence>
        {showBubble && !isOpen && !minimized && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-24 right-6 z-50 max-w-[260px] bg-card border border-border/30 rounded-2xl rounded-br-sm px-4 py-3 shadow-2xl cursor-pointer"
            onClick={handleOpen}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowBubble(false); }}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Fechar balão"
            >
              <X className="w-3 h-3" />
            </button>
            <p className="text-sm text-foreground leading-relaxed pr-4">{bubbleText}</p>
            <div className="absolute -bottom-2 right-5 w-3 h-3 bg-card border-r border-b border-border/30 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botão flutuante */}
      <AnimatePresence>
        {!isOpen && !minimized && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMinimized(true); setShowBubble(false); }}
              className="absolute -top-1 -left-1 z-10 w-4 h-4 rounded-full bg-muted text-muted-foreground border border-border/40 text-[10px] leading-none flex items-center justify-center hover:bg-muted/80"
              aria-label="Minimizar"
            >
              −
            </button>
            <Button
              onClick={handleOpen}
              className="w-14 h-14 rounded-full glow-primary shadow-2xl animate-glow-pulse"
              size="icon"
            >
              <MessageCircle className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modo minimizado: ponto discreto */}
      {!isOpen && minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-6 right-6 z-50 w-2.5 h-2.5 rounded-full bg-primary opacity-60 cursor-pointer hover:opacity-100 transition-opacity"
          aria-label="Restaurar chat"
        />
      )}

      {/* Chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-3 right-3 left-3 sm:left-auto sm:bottom-6 sm:right-6 z-50 sm:w-[400px] max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-3rem)] h-[min(560px,calc(100vh-1.5rem))] flex flex-col glass-strong rounded-2xl overflow-hidden shadow-2xl border border-border/20"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/20 bg-card/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center glow-primary">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">Agente Elite Hub</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online • IA Ativa
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-xl w-8 h-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "gradient-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary/60 text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0 max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="bg-secondary/60 px-4 py-3 rounded-2xl rounded-bl-md flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              {messages.length <= 1 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {(athleteContext?.isCoach ? COACH_QUICK_ACTIONS : STUDENT_QUICK_ACTIONS).map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSend(action.prompt)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
                    >
                      <Zap className="w-3 h-3" />
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/20">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pergunte ao Coach..."
                  className="rounded-xl bg-secondary/30 border-border/20 text-sm"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-xl shrink-0 glow-primary"
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

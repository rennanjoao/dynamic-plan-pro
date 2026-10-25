import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, Flame, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS,
  CRAVINGS,
  GRUPOS,
  INGREDIENTES,
  ROTULO_FLAG,
  type Categoria,
  type Craving,
  type Grupo,
} from "@/data/cravings";

interface Props { trigger?: React.ReactNode }

type FiltroCategoria = Categoria | "todas";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const kcalAprox = (kcal: number) => Math.round(kcal / 5) * 5;
const rotuloKcal = (c: Craving) =>
  c.kcalMin === c.kcalMax ? `~${kcalAprox(c.kcalMin)} kcal` : `~${kcalAprox(c.kcalMin)} a ${kcalAprox(c.kcalMax)} kcal`;

const COR_GRUPO: Record<Grupo, string> = {
  natural: "bg-teal-400",
  caseiro: "bg-amber-400",
  industrializado: "bg-violet-400",
  troca: "bg-pink-400",
};

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "shrink-0 rounded-full border px-3 min-h-8 text-xs font-semibold transition-colors",
        ativo
          ? "bg-pink-600 border-pink-600 text-white"
          : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-pink-500/40",
      )}
    >
      {children}
    </button>
  );
}

function CravingCard({
  item,
  aberto,
  opcaoIdx,
  onToggle,
  onOpcao,
}: {
  item: Craving;
  aberto: boolean;
  opcaoIdx: number;
  onToggle: () => void;
  onOpcao: (idx: number) => void;
}) {
  const painelId = `craving-${item.id}`;
  const opcao = item.opcoes[opcaoIdx] ?? item.opcoes[0];
  const m = item.macros[opcaoIdx] ?? item.macros[0];
  const macros = [
    { rotulo: "Proteína", valor: m.p },
    { rotulo: "Carbo", valor: m.c },
    { rotulo: "Gordura", valor: m.g },
  ];

  return (
    <div className={cn("rounded-xl border bg-card transition-colors", aberto ? "border-pink-500/40" : "hover:border-pink-500/30")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        className="w-full text-left p-3 flex gap-3 items-start"
      >
        <div className="w-12 h-12 shrink-0 rounded-xl bg-pink-500/10 flex items-center justify-center text-2xl" aria-hidden="true">
          {item.icone}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-sm text-foreground leading-tight">{item.titulo}</h3>
            <span className="shrink-0 text-xs font-black text-pink-600 dark:text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Flame className="w-3 h-3" aria-hidden="true" /> {rotuloKcal(item)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.resumo}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" /> {item.tempo}
            </span>
            {item.contem.map((f) => (
              <span key={f} className="rounded bg-muted px-1.5 py-0.5 font-medium">{ROTULO_FLAG[f]}</span>
            ))}
            {item.porcaoFixa && (
              <span className="rounded bg-pink-500/10 px-1.5 py-0.5 font-medium text-pink-600 dark:text-pink-400">Porção fixa</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn("w-4 h-4 shrink-0 mt-1 text-muted-foreground transition-transform", aberto && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {aberto && (
        <div id={painelId} className="px-3 pb-3 border-t border-border/60">
          <div className="pt-3 space-y-3">
            {item.opcoes.length > 1 && (
              <div role="group" aria-label="Escolha a opção" className="flex flex-wrap gap-2">
                {item.opcoes.map((o, i) => (
                  <button
                    key={o.rotulo}
                    type="button"
                    onClick={() => onOpcao(i)}
                    aria-pressed={i === opcaoIdx}
                    className={cn(
                      "flex-1 min-h-11 rounded-lg border px-3 text-sm font-bold transition-colors",
                      i === opcaoIdx
                        ? "bg-pink-600 border-pink-600 text-white"
                        : "bg-background border-border text-foreground hover:border-pink-500/40",
                    )}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            )}

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Porção</h4>
              <ul className="text-xs text-foreground space-y-0.5">
                {opcao.ingredientes.map((l, i) => (
                  <li key={`${l.id}-${i}`}>
                    • {INGREDIENTES[l.id].nome} — <strong>{fmt(l.gramas)} {l.unidade ?? "g"}</strong>
                    {l.medida ? ` (${l.medida})` : ""}
                  </li>
                ))}
                {item.extras?.map((e) => (
                  <li key={e} className="text-muted-foreground">• {e}</li>
                ))}
              </ul>
            </section>

            <div className="grid grid-cols-3 gap-2 text-center">
              {macros.map((x) => (
                <div key={x.rotulo} className="rounded-lg bg-muted/60 py-1.5">
                  <div className="text-sm font-bold text-foreground">{fmt(x.valor)} g</div>
                  <div className="text-xs text-muted-foreground">{x.rotulo}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Esta opção: ~{kcalAprox(m.kcal)} kcal</p>

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Preparo</h4>
              <ol className="text-xs text-foreground space-y-1 list-decimal pl-4">
                {item.preparo.map((passo) => (
                  <li key={passo}>{passo}</li>
                ))}
              </ol>
            </section>

            {item.porcaoFixa && (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/60 p-2">
                <strong className="text-foreground">Porção fixa:</strong> tem mais gordura que o resto da lista. Meça e guarde o resto.
              </p>
            )}

            {item.dica && (
              <p className="text-xs text-muted-foreground rounded-lg bg-pink-500/5 border border-pink-500/15 p-2">
                <strong className="text-foreground">Dica:</strong> {item.dica}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TpmCravingsDialog({ trigger }: Props) {
  const [categoria, setCategoria] = useState<FiltroCategoria>("todas");
  const [semLactose, setSemLactose] = useState(false);
  const [semGluten, setSemGluten] = useState(false);
  const [semAmendoim, setSemAmendoim] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<Record<string, number>>({});

  const visiveis = useMemo(
    () =>
      CRAVINGS.filter(
        (c) =>
          (categoria === "todas" || c.categoria === categoria) &&
          !(semLactose && c.contem.includes("lactose")) &&
          !(semGluten && c.contem.includes("gluten")) &&
          !(semAmendoim && c.contem.includes("amendoim")),
      ),
    [categoria, semLactose, semGluten, semAmendoim],
  );

  const grupos = useMemo(
    () => GRUPOS.map((g) => ({ ...g, itens: visiveis.filter((i) => i.grupo === g.id) })).filter((g) => g.itens.length > 0),
    [visiveis],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-pink-500/30 text-pink-500 hover:text-pink-400 hover:border-pink-500/50 hover:bg-pink-500/10"
          >
            <Heart className="w-3.5 h-3.5 fill-pink-500" /> S.O.S TPM
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85dvh]">
        <DialogHeader className="p-6 pb-4 border-b bg-pink-500/10 shrink-0 space-y-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase text-pink-600 dark:text-pink-400">
            <Heart className="w-5 h-5 fill-pink-500" /> Válvula de Escape
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
            <strong className="text-foreground">Importante:</strong> isso é uma válvula de escape e não faz parte da sua dieta
            diária. Mas, quando estiver passando por um dia difícil ou no auge da sua TPM, escolha uma opção, meça a porção e
            coma sem culpa. Apenas siga o seu protocolo normalmente no dia seguinte.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b px-4 py-3 space-y-2">
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5" role="group" aria-label="Tipo de vontade">
            <Chip ativo={categoria === "todas"} onClick={() => setCategoria("todas")}>Todas</Chip>
            {CATEGORIAS.map((c) => (
              <Chip key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Restrições">
            <Chip ativo={semLactose} onClick={() => setSemLactose((v) => !v)}>Sem lactose</Chip>
            <Chip ativo={semGluten} onClick={() => setSemGluten((v) => !v)}>Sem glúten</Chip>
            <Chip ativo={semAmendoim} onClick={() => setSemAmendoim((v) => !v)}>Sem amendoim</Chip>
            <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {visiveis.length} {visiveis.length === 1 ? "opção" : "opções"}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5" style={{ WebkitOverflowScrolling: "touch" }}>
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma opção com esses filtros. Tire um deles para ver mais.
            </p>
          ) : (
            grupos.map((g) => (
              <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="space-y-2.5">
                <div className="pt-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", COR_GRUPO[g.id])} aria-hidden="true" />
                    <h2 id={`grupo-${g.id}`} className="text-sm font-bold tracking-wide uppercase text-foreground">{g.nome}</h2>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {g.itens.length} {g.itens.length === 1 ? "opção" : "opções"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.subtitulo}</p>
                </div>
                {g.id === "troca" && (
                  <p className="text-xs text-muted-foreground rounded-lg bg-pink-500/5 border border-pink-500/20 p-2 leading-relaxed">
                    <strong className="text-foreground">Troca, não soma.</strong> Se escolher uma destas opções, substitua uma
                    refeição do dia (ex.: lanche da tarde ou jantar).
                  </p>
                )}
                {g.itens.map((item) => (
                  <CravingCard
                    key={item.id}
                    item={item}
                    aberto={abertoId === item.id}
                    opcaoIdx={opcoes[item.id] ?? 0}
                    onToggle={() => setAbertoId((atual) => (atual === item.id ? null : item.id))}
                    onOpcao={(idx) => setOpcoes((prev) => ({ ...prev, [item.id]: idx }))}
                  />
                ))}
              </section>
            ))
          )}

          <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
            <p>
              <strong className="text-foreground">Como usar:</strong> meça a porção antes de começar e coma com calma. Se a
              vontade continuar, beba um copo d’água e espere 10 minutos antes de repetir.
            </p>
            <p>
              <strong className="text-foreground">Fica de fora daqui:</strong> o que é gorduroso e fácil de exagerar, como
              pastas, castanhas, amêndoas, amendoim a granel, recheados e frituras. Chocolate e outros doces gordurosos só nas
              porções fixas da lista.
            </p>
            <p>Valores estimados a partir da tabela TACO e de rótulos. Variações de marca são normais.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  LIMITE_GORDURA_PADRAO_G,
  ROTULO_FLAG,
  aplicarVersao,
  flagsDaVersao,
  macrosDaOpcao,
  versaoPossivel,
  type Categoria,
  type Craving,
  type Grupo,
  type Versao,
} from "@/data/cravings";

interface Props { trigger?: React.ReactNode }

type FiltroCategoria = Categoria | "todas";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const kcalAprox = (kcal: number) => Math.round(kcal / 5) * 5;
const PADRAO: Versao = { semLactose: false, semGluten: false };
const rotuloKcal = (c: Craving, v: Versao) => {
  const kcals = c.opcoes.map((_, i) => macrosDaOpcao(c, i, v).kcal);
  const min = Math.min(...kcals);
  const max = Math.max(...kcals);
  return min === max ? `~${kcalAprox(min)} kcal` : `~${kcalAprox(min)} a ${kcalAprox(max)} kcal`;
};
const mesmaVersao = (a: Versao, b: Versao) => a.semLactose === b.semLactose && a.semGluten === b.semGluten;
const rotuloVersao = (v: Versao) =>
  v.semLactose && v.semGluten ? "Sem lactose e sem glúten" : v.semLactose ? "Sem lactose" : v.semGluten ? "Sem glúten" : "Padrão";

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
        "shrink-0 rounded-full border px-3 min-h-10 text-xs font-semibold transition-colors",
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
  versao,
  onToggle,
  onOpcao,
  onVersao,
}: {
  item: Craving;
  aberto: boolean;
  opcaoIdx: number;
  versao: Versao;
  onToggle: () => void;
  onOpcao: (idx: number) => void;
  onVersao: (v: Versao) => void;
}) {
  const painelId = `craving-${item.id}`;
  const opcao = item.opcoes[opcaoIdx] ?? item.opcoes[0];
  const linhas = aplicarVersao(opcao.ingredientes, versao) ?? opcao.ingredientes;
  const m = macrosDaOpcao(item, opcaoIdx, versao);
  const flags = flagsDaVersao(item, versao);
  const ehPadrao = mesmaVersao(versao, PADRAO);
  const temLactose = item.contem.includes("lactose");
  const temGluten = item.contem.includes("gluten");
  const candidatas: Versao[] = [];
  if (temLactose || temGluten) candidatas.push(PADRAO);
  if (temLactose) candidatas.push({ semLactose: true, semGluten: false });
  if (temGluten) candidatas.push({ semLactose: false, semGluten: true });
  if (temLactose && temGluten) candidatas.push({ semLactose: true, semGluten: true });
  const versoes = candidatas.filter((v) => mesmaVersao(v, PADRAO) || versaoPossivel(item, v));
  const textosSemVersao = [
    ...new Set(
      [
        temLactose && !versaoPossivel(item, { semLactose: true, semGluten: false }) ? item.semVersao?.lactose : undefined,
        temGluten && !versaoPossivel(item, { semLactose: false, semGluten: true }) ? item.semVersao?.gluten : undefined,
      ].filter((t): t is string => !!t),
    ),
  ];
  const usaEquivalente = !ehPadrao && linhas.some((l) => INGREDIENTES[l.id].fonte === "equivalente");
  const temPaoSemGluten = !ehPadrao && linhas.some((l) => /^pao\w*SemGluten$/.test(l.id));
  const fixaNaOpcao = item.grupo !== "troca" && m.g > LIMITE_GORDURA_PADRAO_G;
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
            <span className="shrink-0 text-xs font-black text-pink-700 dark:text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Flame className="w-3 h-3" aria-hidden="true" /> {rotuloKcal(item, versao)}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{item.resumo}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" /> {item.tempo}
            </span>
            {!ehPadrao && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-zinc-600 dark:text-muted-foreground">
                Versão {rotuloVersao(versao).toLowerCase()}
              </span>
            )}
            {flags.map((f) => (
              <span key={f} className="rounded bg-muted px-1.5 py-0.5 font-medium text-zinc-600 dark:text-muted-foreground">{ROTULO_FLAG[f]}</span>
            ))}
            {item.porcaoFixa && (
              <span className="rounded bg-pink-500/10 px-1.5 py-0.5 font-medium text-pink-700 dark:text-pink-400">Porção fixa</span>
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

            {versoes.length > 1 && (
              <div role="group" aria-label="Versão" className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Versão</p>
                <div className="flex flex-wrap gap-2">
                  {versoes.map((v) => {
                    const ativo = mesmaVersao(v, versao);
                    return (
                      <button
                        key={rotuloVersao(v)}
                        type="button"
                        onClick={() => onVersao(v)}
                        aria-pressed={ativo}
                        className={cn(
                          "flex-1 min-h-11 rounded-lg border px-3 text-sm font-bold transition-colors",
                          ativo
                            ? "bg-pink-600 border-pink-600 text-white"
                            : "bg-background border-border text-foreground hover:border-pink-500/40",
                        )}
                      >
                        {rotuloVersao(v)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {textosSemVersao.map((t) => (
              <p key={t} className="text-xs rounded-lg bg-muted/60 p-2 text-zinc-600 dark:text-muted-foreground">{t}</p>
            ))}

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Porção</h4>
              <ul className="text-[13px] text-foreground space-y-0.5">
                {linhas.map((l, i) => (
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
                  <div className="text-xs text-zinc-600 dark:text-muted-foreground">{x.rotulo}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Esta opção: ~{kcalAprox(m.kcal)} kcal</p>

            {usaEquivalente && (
              <p className="text-xs rounded-lg bg-muted/60 p-2 text-zinc-600 dark:text-muted-foreground">
                Valores da versão zero lactose / sem glúten equivalentes ao ingrediente comum. Confira o rótulo.
                {temPaoSemGluten ? " Pão sem glúten costuma ter de 5 a 15% a mais de kcal." : ""}
              </p>
            )}

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Preparo</h4>
              <ol className="text-[13px] text-foreground space-y-1 list-decimal pl-4">
                {item.preparo.map((passo) => (
                  <li key={passo}>{passo}</li>
                ))}
              </ol>
            </section>

            {fixaNaOpcao && (
              <p className="text-xs text-zinc-600 dark:text-muted-foreground rounded-lg bg-muted/60 p-2">
                <strong className="text-foreground">Porção fixa:</strong> tem mais gordura que o resto da lista. Meça e guarde o resto.
              </p>
            )}

            {item.dica && (
              <p className="text-[13px] text-muted-foreground rounded-lg bg-pink-500/5 border border-pink-500/15 p-2">
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
  const [semOvo, setSemOvo] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<Record<string, number>>({});
  const [versoes, setVersoes] = useState<Record<string, Versao>>({});
  const [aberto, setAberto] = useState(false);

  const onOpenChange = (v: boolean) => {
    setAberto(v);
    if (!v) {
      setCategoria("todas");
      setSemLactose(false);
      setSemGluten(false);
      setSemAmendoim(false);
      setSemOvo(false);
      setAbertoId(null);
      setOpcoes({});
      setVersoes({});
    }
  };

  const versaoDe = (c: Craving): Versao =>
    versoes[c.id] ?? {
      semLactose: semLactose && c.contem.includes("lactose"),
      semGluten: semGluten && c.contem.includes("gluten"),
    };

  const visiveis = useMemo(
    () =>
      CRAVINGS.filter(
        (c) =>
          (categoria === "todas" || c.categoria === categoria) &&
          versaoPossivel(c, { semLactose, semGluten }) &&
          !(semAmendoim && c.contem.includes("amendoim")) &&
          !(semOvo && c.contem.includes("ovo")),
      ),
    [categoria, semLactose, semGluten, semAmendoim, semOvo],
  );

  const grupos = useMemo(
    () => GRUPOS.map((g) => ({ ...g, itens: visiveis.filter((i) => i.grupo === g.id) })).filter((g) => g.itens.length > 0),
    [visiveis],
  );

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
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
        <div data-testid="sos-fixo" className="shrink-0">
        <DialogHeader className="px-6 py-4 border-b bg-pink-500/10 space-y-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase text-pink-700 dark:text-pink-400">
            <Heart className="w-5 h-5 fill-pink-500" /> Válvula de Escape
          </DialogTitle>
          <DialogDescription className="sr-only">Opções medidas para matar a vontade de doce sem culpa.</DialogDescription>
        </DialogHeader>

        <div className="border-b px-4 py-3 space-y-2">
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
            <Chip ativo={semOvo} onClick={() => setSemOvo((v) => !v)}>Sem ovo</Chip>
            <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {visiveis.length} {visiveis.length === 1 ? "opção" : "opções"}
            </span>
          </div>
        </div>
        </div>

        <div
          data-testid="sos-lista"
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <p className="text-[13px] text-foreground rounded-xl bg-pink-500/10 p-3 leading-relaxed">
            <strong className="text-foreground">Importante:</strong> isso é uma válvula de escape e não faz parte da sua dieta
            diária. Mas, quando estiver passando por um dia difícil ou no auge da sua TPM, escolha uma opção, meça a porção e
            coma sem culpa. Apenas siga o seu protocolo normalmente no dia seguinte.
          </p>
          <p data-testid="sos-como-usar" className="text-[13px] rounded-xl border bg-muted/40 p-3 leading-relaxed text-zinc-600 dark:text-muted-foreground">
            <strong className="text-foreground">Como usar:</strong> meça a porção antes de começar e coma com calma. Se a
            vontade continuar, beba um copo d’água e espere 10 minutos antes de repetir.
          </p>
          <p className="text-xs text-muted-foreground">
            Os filtros ajudam, mas não substituem o rótulo. Em caso de alergia, confira sempre a embalagem.
          </p>

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
                    refeição do dia (ex.: lanche da tarde ou jantar). As opções dos outros grupos são extras pontuais.
                  </p>
                )}
                {g.itens.map((item) => (
                  <CravingCard
                    key={item.id}
                    item={item}
                    aberto={abertoId === item.id}
                    opcaoIdx={opcoes[item.id] ?? 0}
                    versao={versaoDe(item)}
                    onVersao={(v) => setVersoes((prev) => ({ ...prev, [item.id]: v }))}
                    onToggle={() => setAbertoId((atual) => (atual === item.id ? null : item.id))}
                    onOpcao={(idx) => setOpcoes((prev) => ({ ...prev, [item.id]: idx }))}
                  />
                ))}
              </section>
            ))
          )}

          <div className="rounded-xl border bg-muted/40 p-3 text-xs text-zinc-600 dark:text-muted-foreground space-y-1.5 leading-relaxed">
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

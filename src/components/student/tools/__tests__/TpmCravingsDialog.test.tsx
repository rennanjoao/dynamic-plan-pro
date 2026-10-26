import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TpmCravingsDialog from "../TpmCravingsDialog";
import { CRAVINGS } from "@/data/cravings";

async function abrir() {
  const user = userEvent.setup();
  render(<TpmCravingsDialog />);
  await user.click(screen.getByRole("button", { name: /S\.O\.S TPM/i }));
  return user;
}

describe("TpmCravingsDialog", () => {
  it("abre e mostra o título, a mensagem de abertura e todas as opções", async () => {
    await abrir();
    expect(screen.getByText("Válvula de Escape")).toBeInTheDocument();
    expect(screen.getByText(/no auge da sua TPM/)).toBeInTheDocument();
    expect(screen.getByText(/siga o seu protocolo normalmente no dia seguinte/)).toBeInTheDocument();
    expect(screen.getByText("48 opções")).toBeInTheDocument();
  });

  it("mostra os 4 grupos na ordem, e o aviso da troca de refeição", async () => {
    await abrir();
    const titulos = Array.from(screen.getByRole("dialog").querySelectorAll("h2[id^='grupo-']")).map((h) => h.textContent);
    expect(titulos).toEqual(["Naturais", "Caseiros e tradicionais", "Industrializados", "Troca de refeição"]);
    expect(screen.getByText("Troca, não soma.")).toBeInTheDocument();
  });

  it("filtra por categoria e o contador acompanha", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("button", { name: "Gelado" }));
    const gelados = CRAVINGS.filter((c) => c.categoria === "gelado").length;
    expect(screen.getByText(`${gelados} opções`)).toBeInTheDocument();
    expect(screen.getByText("Melancia Gelada")).toBeInTheDocument();
    expect(screen.queryByText("Pipoca de Milho na Água")).not.toBeInTheDocument();
  });

  it("os filtros de restrição escondem lactose, amendoim e glúten", async () => {
    const user = await abrir();
    expect(screen.getByText("Morango com Leite Moça")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sem lactose" }));
    expect(screen.queryByText("Morango com Leite Moça")).not.toBeInTheDocument();
    expect(screen.getByText("Goiabada Cascão")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sem lactose" }));

    await user.click(screen.getByRole("button", { name: "Sem amendoim" }));
    expect(screen.queryByText("Bombom Sonho de Valsa ou Ouro Branco")).not.toBeInTheDocument();
    expect(screen.queryByText("Paçoca Rolha Zero Açúcar")).not.toBeInTheDocument();
    expect(screen.getByText("Chocolate 70% Cacau")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sem amendoim" }));

    await user.click(screen.getByRole("button", { name: "Sem glúten" }));
    expect(screen.queryByText("Torrada com Tomate e Orégano")).not.toBeInTheDocument();
  });

  it("grupo sem itens visíveis some da lista", async () => {
    const user = await abrir();
    await user.click(screen.getByRole("button", { name: "Crocante" }));
    const titulos = Array.from(screen.getByRole("dialog").querySelectorAll("h2[id^='grupo-']")).map((h) => h.textContent);
    expect(titulos).toContain("Naturais");
    expect(titulos).not.toContain("Troca de refeição");
  });

  it("mostra o selo 'Porção fixa' só nos itens de gordura mais alta", async () => {
    await abrir();
    expect(screen.getAllByText("Porção fixa")).toHaveLength(CRAVINGS.filter((c) => c.porcaoFixa).length);
  });

  it("Suspiro tem 3 porções e a kcal acompanha a escolha", async () => {
    const user = await abrir();
    await user.click(screen.getByText("Suspiro"));
    const painel = document.getElementById("craving-suspiro")!;
    expect(within(painel).getByRole("button", { name: "30 g" })).toHaveAttribute("aria-pressed", "true");
    expect(within(painel).getByText("Esta opção: ~105 kcal")).toBeInTheDocument();
    await user.click(within(painel).getByRole("button", { name: "60 g" }));
    expect(within(painel).getByRole("button", { name: "60 g" })).toHaveAttribute("aria-pressed", "true");
    expect(within(painel).getByText("Esta opção: ~215 kcal")).toBeInTheDocument();
  });

  it("Chocolate Quente Fit deixa escolher o leite e avisa quando a opção tem mais gordura", async () => {
    const user = await abrir();
    await user.click(screen.getByText("Chocolate Quente Fit"));
    const painel = document.getElementById("craving-chocolate-quente-fit")!;
    expect(within(painel).getByText("Esta opção: ~85 kcal")).toBeInTheDocument();
    expect(within(painel).queryByText(/tem mais gordura que o resto da lista/i)).not.toBeInTheDocument();
    await user.click(within(painel).getByRole("button", { name: "Leite integral" }));
    expect(within(painel).getByText("Esta opção: ~125 kcal")).toBeInTheDocument();
    expect(within(painel).getByText(/tem mais gordura que o resto da lista/i)).toBeInTheDocument();
  });

  it("não mostra mousse de banana, banana quente com cacau nem meia barra", async () => {
    await abrir();
    for (const t of ["Mousse de Banana com Cacau", "Banana Quente com Cacau e Canela", "Snickers (Meia Barra)"]) {
      expect(screen.queryByText(t), t).not.toBeInTheDocument();
    }
    expect(screen.getByText("Minis de Chocolate (Qualquer Versão Mini)")).toBeInTheDocument();
  });

  it("Picolé Caseiro de Fruta oferece três frutas leves", async () => {
    const user = await abrir();
    await user.click(screen.getByText("Picolé Caseiro de Fruta"));
    const painel = document.getElementById("craving-picole-caseiro")!;
    for (const fruta of ["Melancia", "Morango", "Abacaxi com hortelã"]) {
      expect(within(painel).getByRole("button", { name: fruta })).toBeInTheDocument();
    }
  });

  it("card abre e fecha, e só um fica aberto por vez", async () => {
    const user = await abrir();
    const cha = screen.getByRole("button", { name: /Chá Quente com Mel/ });
    const uva = screen.getByRole("button", { name: /Uva Congelada/ });
    expect(cha).toHaveAttribute("aria-expanded", "false");
    await user.click(cha);
    expect(cha).toHaveAttribute("aria-expanded", "true");
    await user.click(uva);
    expect(cha).toHaveAttribute("aria-expanded", "false");
    expect(uva).toHaveAttribute("aria-expanded", "true");
    const painel = document.getElementById("craving-uva-congelada")!;
    expect(within(painel).getByText("Preparo")).toBeInTheDocument();
    expect(within(painel).getByText("Gordura")).toBeInTheDocument();
    await user.click(uva);
    expect(uva).toHaveAttribute("aria-expanded", "false");
  });
});

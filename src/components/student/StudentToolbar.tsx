/**
 * StudentToolbar.tsx — Barra de ferramentas do aluno (TACO, FODMAP, Proteínas, S.O.S TPM).
 */
import FoodmapsDialog from "./tools/FoodmapsDialog";
import ProteinGuideDialog from "./tools/ProteinGuideDialog";
import TacoCalculatorDialog from "./tools/TacoCalculatorDialog";
import TpmCravingsDialog from "./tools/TpmCravingsDialog";

export default function StudentToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TacoCalculatorDialog />
      <ProteinGuideDialog />
      <FoodmapsDialog />
      {/* id usado pelo botão "Abrir o S.O.S TPM" das Novidades (?highlight=tool-tpm) */}
      <div id="tool-tpm">
        <TpmCravingsDialog />
      </div>
    </div>
  );
}

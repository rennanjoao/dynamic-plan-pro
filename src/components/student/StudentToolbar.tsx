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
      <TpmCravingsDialog />
    </div>
  );
}

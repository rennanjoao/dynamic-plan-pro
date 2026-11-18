import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/untyped", () => ({ sb: {} }));
import { FALLBACK_COACH_NAME, coachSignature, toCoachIdentity } from "@/hooks/useCoachIdentity";

describe("identidade do coach", () => {
  it("usa o nome do perfil do coach", () => {
    const c = toCoachIdentity({ coach_id: "c1", full_name: " Ana Souza ", cref: "123456-G/SP", team_name: "Time Ana" });
    expect(c).toMatchObject({ coachId: "c1", name: "Ana Souza", known: true, cref: "123456-G/SP", teamName: "Time Ana" });
    expect(coachSignature(c)).toBe("Ana Souza · CREF 123456-G/SP");
  });
  it("sem nome cadastrado mostra 'seu coach' (nunca o nome de outra pessoa)", () => {
    const c = toCoachIdentity(null);
    expect(c.name).toBe(FALLBACK_COACH_NAME);
    expect(c.known).toBe(false);
    expect(coachSignature(c)).toBe(FALLBACK_COACH_NAME);
  });
  it("não duplica a palavra CREF", () => {
    expect(coachSignature({ name: "Ana", cref: "CREF 1-G/SP" })).toBe("Ana · CREF 1-G/SP");
  });
});

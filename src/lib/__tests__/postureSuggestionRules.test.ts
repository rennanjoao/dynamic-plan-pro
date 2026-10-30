import { describe, expect, it } from "vitest";
import {
  emptyPostureForm,
  postureStoragePath,
  suggestionFor,
  validatePostureForm,
} from "@/lib/postureSuggestionRules";

describe("posture assessment rules", () => {
  it("accepts a preliminary empty form", () => {
    expect(validatePostureForm(emptyPostureForm())).toEqual([]);
  });

  it("rejects pain above 10", () => {
    const f = emptyPostureForm();
    f.painScore = 11;
    expect(validatePostureForm(f).length).toBe(1);
  });

  it("rejects progression level 7", () => {
    const f = emptyPostureForm();
    f.progressionLevel = 7 as never;
    expect(validatePostureForm(f).length).toBe(1);
  });

  it("requires referral when a red flag is marked", () => {
    const f = emptyPostureForm();
    f.redFlags.tingling = true;
    expect(validatePostureForm(f)).toContain("Com sinal de alerta marcado, registre o encaminhamento recomendado.");
    f.referralRecommended = true;
    expect(validatePostureForm(f)).toEqual([]);
  });

  it("blocks completed functional tests when a red flag is marked", () => {
    const f = emptyPostureForm();
    f.redFlags.trauma = true;
    f.referralRecommended = true;
    f.functionalTests[0].completed = true;
    expect(validatePostureForm(f).length).toBe(1);
  });

  it("hides exercise suggestions when a red flag is marked", () => {
    const f = emptyPostureForm();
    expect(suggestionFor("glute_bridge" as never, f.redFlags)).toBeUndefined();
    expect(suggestionFor("knee_valgus_squat_lunge", f.redFlags)).not.toBeNull();
    f.redFlags.radiating_pain = true;
    expect(suggestionFor("knee_valgus_squat_lunge", f.redFlags)).toBeNull();
  });

  it("stores photos under the student's private folder", () => {
    expect(postureStoragePath("s1", "a1", "front", "IMG.JPG")).toBe("s1/posture-assessments/a1/front.jpg");
  });
});

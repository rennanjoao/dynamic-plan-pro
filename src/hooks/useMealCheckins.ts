import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useMealCheckins — marca refeições concluídas do dia.
 * Fonte de verdade local (localStorage) com sync silencioso pra `meal_checkins`.
 */
export function useMealCheckins(userId: string | null | undefined, dateKey: string, totalMeals: number) {
  const storageKey = `meal_checkins_${userId ?? "anon"}_${dateKey}`;
  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(checked)); } catch { /* noop */ }
  }, [checked, storageKey]);

  const toggle = useCallback((mealIndex: number) => {
    if (!userId) return;
    setChecked((prev) => {
      const next = { ...prev, [mealIndex]: !prev[mealIndex] };
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(next[mealIndex] ? [15, 30, 15] : 10);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("meal_checkins")
        .upsert({
          student_id: userId,
          date: dateKey,
          meal_index: mealIndex,
          checked: next[mealIndex],
          updated_at: new Date().toISOString(),
        })
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn("[meal_checkins] sync falhou:", error);
        });
      return next;
    });
  }, [userId, dateKey]);

  const doneCount = Object.values(checked).filter(Boolean).length;
  return {
    checked,
    toggle,
    doneCount,
    totalMeals,
    progressPct: totalMeals ? Math.round((doneCount / totalMeals) * 100) : 0,
  };
}
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BodyMeasurement {
  id: string;
  measurement_date: string;
  weight: number | null;
  waist: number | null;
  hip: number | null;
  arm: number | null;
  thigh: number | null;
  chest: number | null;
  back: number | null;
  calf: number | null;
  forearm: number | null;
  body_fat_percentage: number | null;
}

export interface SkinfoldMeasurement {
  id: string;
  measurement_date: string;
  weight: number | null;
  triceps: number | null;
  subscapular: number | null;
  suprailiac: number | null;
  abdominal: number | null;
  thigh: number | null;
  biceps: number | null;
  chest: number | null;
  midaxillary: number | null;
  calf: number | null;
  body_fat_percentage: number | null;
  protocol_used: string | null;
}

export const useMeasurements = () => {
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [skinfoldMeasurements, setSkinfoldMeasurements] = useState<SkinfoldMeasurement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeasurements = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: bodyData, error: bodyError } = await supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", user.id)
        .order("measurement_date", { ascending: false });

      if (bodyError) throw bodyError;

      const { data: skinfoldData, error: skinfoldError } = await supabase
        .from("skinfold_measurements")
        .select("*")
        .eq("user_id", user.id)
        .order("measurement_date", { ascending: false });

      if (skinfoldError) throw skinfoldError;

      setBodyMeasurements(bodyData || []);
      setSkinfoldMeasurements(skinfoldData || []);
    } catch (error: any) {
      console.error("Error fetching measurements:", error);
      toast.error("Erro ao carregar medidas");
    } finally {
      setLoading(false);
    }
  };

  const addBodyMeasurement = async (measurement: Omit<BodyMeasurement, "id" | "measurement_date">) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Calculate body fat percentage
      const bodyFat = calculateBodyFat(measurement);

      const { error } = await supabase
        .from("body_measurements")
        .insert({
          user_id: user.id,
          ...measurement,
          body_fat_percentage: bodyFat,
        });

      if (error) throw error;

      toast.success("Medidas registradas com sucesso!");
      fetchMeasurements();
    } catch (error: any) {
      console.error("Error adding measurement:", error);
      toast.error("Erro ao registrar medidas");
    }
  };

  const addSkinfoldMeasurement = async (
    measurement: Omit<SkinfoldMeasurement, "id" | "measurement_date" | "body_fat_percentage" | "protocol_used">,
    protocol: "jackson_pollock_3" | "jackson_pollock_4" | "jackson_pollock_7"
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Calculate body fat using Jackson-Pollock protocol
      const bodyFat = calculateSkinfoldBodyFat(measurement, protocol);

      const { error } = await supabase
        .from("skinfold_measurements")
        .insert({
          user_id: user.id,
          ...measurement,
          body_fat_percentage: bodyFat,
          protocol_used: protocol,
        });

      if (error) throw error;

      toast.success("Dobras cutâneas registradas com sucesso!");
      fetchMeasurements();
    } catch (error: any) {
      console.error("Error adding skinfold measurement:", error);
      toast.error("Erro ao registrar dobras cutâneas");
    }
  };

  useEffect(() => {
    fetchMeasurements();
  }, []);

  return {
    bodyMeasurements,
    skinfoldMeasurements,
    loading,
    addBodyMeasurement,
    addSkinfoldMeasurement,
    refetch: fetchMeasurements,
  };
};

// US Navy Method for body fat estimation
// Requires: height (cm), neck (cm), waist (cm), and hip (cm) for females.
function calculateBodyFat(
  measurement: Omit<BodyMeasurement, "id" | "measurement_date"> & {
    neck?: number | null;
    height?: number | null;
    hip?: number | null;
    gender?: "M" | "F" | string | null;
  }
): number | null {
  const height = Number(measurement.height ?? 0);
  const neck = Number(measurement.neck ?? 0);
  const waist = Number(measurement.waist ?? 0);
  const hip = Number(measurement.hip ?? 0);
  const gender = (measurement.gender ?? "M").toString().toUpperCase();

  if (height <= 0 || neck <= 0 || waist <= 0) return null;

  let bf: number;
  if (gender === "F") {
    const inner = waist + hip - neck;
    if (inner <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(inner) + 0.22100 * Math.log10(height)) - 450;
  } else {
    const inner = waist - neck;
    if (inner <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(inner) + 0.15456 * Math.log10(height)) - 450;
  }

  if (!isFinite(bf) || bf <= 0) return null;
  return Number(bf.toFixed(2));
}

// Jackson-Pollock protocols for body fat calculation
function calculateSkinfoldBodyFat(
  measurement: Omit<SkinfoldMeasurement, "id" | "measurement_date" | "body_fat_percentage" | "protocol_used">,
  protocol: string
): number | null {
  // Jackson-Pollock 3-site formula (simplified - would need gender and age for accuracy)
  if (protocol === "jackson_pollock_3") {
    if (!measurement.chest || !measurement.abdominal || !measurement.thigh) return null;
    
    const sum = measurement.chest + measurement.abdominal + measurement.thigh;
    const bodyDensity = 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum);
    const bodyFat = ((4.95 / bodyDensity) - 4.50) * 100;
    
    return Math.round(bodyFat * 10) / 10;
  }
  
  // Jackson-Pollock 7-site formula (simplified)
  if (protocol === "jackson_pollock_7") {
    const sum = 
      (measurement.chest || 0) +
      (measurement.abdominal || 0) +
      (measurement.thigh || 0) +
      (measurement.triceps || 0) +
      (measurement.subscapular || 0) +
      (measurement.suprailiac || 0) +
      (measurement.midaxillary || 0);
    
    if (sum === 0) return null;
    
    const bodyDensity = 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum);
    const bodyFat = ((4.95 / bodyDensity) - 4.50) * 100;
    
    return Math.round(bodyFat * 10) / 10;
  }
  
  return null;
}

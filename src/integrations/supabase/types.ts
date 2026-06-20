export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          accessed_at: string
          email: string | null
          full_name: string | null
          id: string
          ip_address: string | null
          role: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accessed_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          role?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accessed_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          role?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      anamnesis: {
        Row: {
          arm_flexed: number | null
          arm_relaxed: number | null
          baseline_metrics: Json
          body_fat: number | null
          coach_id: string | null
          created_at: string
          id: string
          payload: Json
          student_edit_count: number
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          arm_flexed?: number | null
          arm_relaxed?: number | null
          baseline_metrics?: Json
          body_fat?: number | null
          coach_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          student_edit_count?: number
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          arm_flexed?: number | null
          arm_relaxed?: number | null
          baseline_metrics?: Json
          body_fat?: number | null
          coach_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          student_edit_count?: number
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      avatar_customization: {
        Row: {
          clothing_color: string
          eye_color: string
          hair_color: string
          hair_style: string
          id: string
          nail_color: string | null
          shoe_accent_color: string
          shoe_color: string
          skin_color: string
          updated_at: string
          user_id: string
          water_bottle_color: string
        }
        Insert: {
          clothing_color?: string
          eye_color?: string
          hair_color?: string
          hair_style?: string
          id?: string
          nail_color?: string | null
          shoe_accent_color?: string
          shoe_color?: string
          skin_color?: string
          updated_at?: string
          user_id: string
          water_bottle_color?: string
        }
        Update: {
          clothing_color?: string
          eye_color?: string
          hair_color?: string
          hair_style?: string
          id?: string
          nail_color?: string | null
          shoe_accent_color?: string
          shoe_color?: string
          skin_color?: string
          updated_at?: string
          user_id?: string
          water_bottle_color?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          arm: number | null
          back: number | null
          body_fat_percentage: number | null
          calf: number | null
          chest: number | null
          created_at: string
          forearm: number | null
          hip: number | null
          id: string
          measurement_date: string
          neck: number | null
          thigh: number | null
          user_id: string
          waist: number | null
          weight: number | null
        }
        Insert: {
          arm?: number | null
          back?: number | null
          body_fat_percentage?: number | null
          calf?: number | null
          chest?: number | null
          created_at?: string
          forearm?: number | null
          hip?: number | null
          id?: string
          measurement_date?: string
          neck?: number | null
          thigh?: number | null
          user_id: string
          waist?: number | null
          weight?: number | null
        }
        Update: {
          arm?: number | null
          back?: number | null
          body_fat_percentage?: number | null
          calf?: number | null
          chest?: number | null
          created_at?: string
          forearm?: number | null
          hip?: number | null
          id?: string
          measurement_date?: string
          neck?: number | null
          thigh?: number | null
          user_id?: string
          waist?: number | null
          weight?: number | null
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          arm_flexed: number | null
          arm_relaxed: number | null
          body_fat: number | null
          coach_feedback: string | null
          coach_id: string | null
          created_at: string
          current_metrics: Json
          edit_count: number
          feedback_read_at: string | null
          id: string
          payload: Json
          photo_url: string | null
          student_id: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          arm_flexed?: number | null
          arm_relaxed?: number | null
          body_fat?: number | null
          coach_feedback?: string | null
          coach_id?: string | null
          created_at?: string
          current_metrics?: Json
          edit_count?: number
          feedback_read_at?: string | null
          id?: string
          payload?: Json
          photo_url?: string | null
          student_id: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          arm_flexed?: number | null
          arm_relaxed?: number | null
          body_fat?: number | null
          coach_feedback?: string | null
          coach_id?: string | null
          created_at?: string
          current_metrics?: Json
          edit_count?: number
          feedback_read_at?: string | null
          id?: string
          payload?: Json
          photo_url?: string | null
          student_id?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      coach_finances: {
        Row: {
          amount: number
          coach_id: string
          created_at: string
          description: string
          due_date: string | null
          id: string
          paid_at: string | null
          status: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          coach_id: string
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          paid_at?: string | null
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          coach_id?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          paid_at?: string | null
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coach_invites: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          note: string | null
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          note?: string | null
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      coach_leads: {
        Row: {
          coach_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          source: string | null
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      coach_notifications: {
        Row: {
          coach_id: string
          context: string
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          student_id: string | null
          student_name: string
        }
        Insert: {
          coach_id: string
          context: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          student_id?: string | null
          student_name: string
        }
        Update: {
          coach_id?: string
          context?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          student_id?: string | null
          student_name?: string
        }
        Relationships: []
      }
      coach_plans: {
        Row: {
          base_calories: number | null
          base_carbs_g: number | null
          base_fat_g: number | null
          base_protein_g: number | null
          calories: number
          carbs_g: number
          coach_id: string
          created_at: string
          diet_strategy_json: Json | null
          fat_g: number
          goal: string
          id: string
          notes: string | null
          protein_g: number
          student_id: string
          updated_at: string
          water_l: number
          workout_periodization_json: Json | null
        }
        Insert: {
          base_calories?: number | null
          base_carbs_g?: number | null
          base_fat_g?: number | null
          base_protein_g?: number | null
          calories?: number
          carbs_g?: number
          coach_id: string
          created_at?: string
          diet_strategy_json?: Json | null
          fat_g?: number
          goal?: string
          id?: string
          notes?: string | null
          protein_g?: number
          student_id: string
          updated_at?: string
          water_l?: number
          workout_periodization_json?: Json | null
        }
        Update: {
          base_calories?: number | null
          base_carbs_g?: number | null
          base_fat_g?: number | null
          base_protein_g?: number | null
          calories?: number
          carbs_g?: number
          coach_id?: string
          created_at?: string
          diet_strategy_json?: Json | null
          fat_g?: number
          goal?: string
          id?: string
          notes?: string | null
          protein_g?: number
          student_id?: string
          updated_at?: string
          water_l?: number
          workout_periodization_json?: Json | null
        }
        Relationships: []
      }
      coach_students: {
        Row: {
          coach_id: string
          created_at: string
          critical_days: number | null
          feedback_interval_days: number | null
          id: string
          notes: string | null
          status: string
          student_id: string
          updated_at: string
          warning_days: number | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          critical_days?: number | null
          feedback_interval_days?: number | null
          id?: string
          notes?: string | null
          status?: string
          student_id: string
          updated_at?: string
          warning_days?: number | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          critical_days?: number | null
          feedback_interval_days?: number | null
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          warning_days?: number | null
        }
        Relationships: []
      }
      daily_alerts: {
        Row: {
          created_at: string
          frequency: string
          id: string
          is_active: boolean | null
          message: string
          student_id: string
          target_date: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          message: string
          student_id: string
          target_date?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          message?: string
          student_id?: string
          target_date?: string | null
          trainer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          created_at: string
          diet_ok: boolean
          id: string
          log_date: string
          notes: string | null
          student_id: string
          updated_at: string
          water_ok: boolean
          workout_ok: boolean
        }
        Insert: {
          created_at?: string
          diet_ok?: boolean
          id?: string
          log_date?: string
          notes?: string | null
          student_id: string
          updated_at?: string
          water_ok?: boolean
          workout_ok?: boolean
        }
        Update: {
          created_at?: string
          diet_ok?: boolean
          id?: string
          log_date?: string
          notes?: string | null
          student_id?: string
          updated_at?: string
          water_ok?: boolean
          workout_ok?: boolean
        }
        Relationships: []
      }
      diet_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          date: string
          id: string
          meal_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          date?: string
          id?: string
          meal_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          date?: string
          id?: string
          meal_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_templates: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          kind: string
          meal_data: Json
          name: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          kind?: string
          meal_data: Json
          name: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          kind?: string
          meal_data?: Json
          name?: string
        }
        Relationships: []
      }
      performance_logs: {
        Row: {
          created_at: string
          daily_score: number | null
          date: string
          diet_score: number | null
          id: string
          is_anonymous: boolean | null
          meals_completed: number
          rest_day_score: number | null
          sleep_score: number | null
          total_meals: number
          total_workouts: number
          updates_score: number | null
          user_id: string
          water_score: number | null
          workout_score: number | null
          workouts_completed: number
        }
        Insert: {
          created_at?: string
          daily_score?: number | null
          date?: string
          diet_score?: number | null
          id?: string
          is_anonymous?: boolean | null
          meals_completed?: number
          rest_day_score?: number | null
          sleep_score?: number | null
          total_meals?: number
          total_workouts?: number
          updates_score?: number | null
          user_id: string
          water_score?: number | null
          workout_score?: number | null
          workouts_completed?: number
        }
        Update: {
          created_at?: string
          daily_score?: number | null
          date?: string
          diet_score?: number | null
          id?: string
          is_anonymous?: boolean | null
          meals_completed?: number
          rest_day_score?: number | null
          sleep_score?: number | null
          total_meals?: number
          total_workouts?: number
          updates_score?: number | null
          user_id?: string
          water_score?: number | null
          workout_score?: number | null
          workouts_completed?: number
        }
        Relationships: []
      }
      platform_billing_charges: {
        Row: {
          amount: number
          coach_id: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period: string
          status: string
          student_count: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount?: number
          coach_id: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period: string
          status?: string
          student_count?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          coach_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period?: string
          status?: string
          student_count?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_alert_days: number | null
          blocked_until: string | null
          created_at: string
          cref: string | null
          email: string | null
          feedback_interval_days: number
          full_name: string | null
          id: string
          invite_code: string | null
          notification_email: string | null
          pix_key: string | null
          team_name: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_alert_days?: number | null
          blocked_until?: string | null
          created_at?: string
          cref?: string | null
          email?: string | null
          feedback_interval_days?: number
          full_name?: string | null
          id?: string
          invite_code?: string | null
          notification_email?: string | null
          pix_key?: string | null
          team_name?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_alert_days?: number | null
          blocked_until?: string | null
          created_at?: string
          cref?: string | null
          email?: string | null
          feedback_interval_days?: number
          full_name?: string | null
          id?: string
          invite_code?: string | null
          notification_email?: string | null
          pix_key?: string | null
          team_name?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      protocol_import_logs: {
        Row: {
          anomalies_count: number
          coach_id: string
          created_at: string
          file_name: string
          id: string
          resolved_items: Json
          status: string
          student_id: string | null
        }
        Insert: {
          anomalies_count?: number
          coach_id: string
          created_at?: string
          file_name: string
          id?: string
          resolved_items?: Json
          status: string
          student_id?: string | null
        }
        Update: {
          anomalies_count?: number
          coach_id?: string
          created_at?: string
          file_name?: string
          id?: string
          resolved_items?: Json
          status?: string
          student_id?: string | null
        }
        Relationships: []
      }
      protocols: {
        Row: {
          active: boolean | null
          coach_id: string | null
          created_at: string
          id: string
          is_template: boolean | null
          name: string
          payload: Json
          student_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          coach_id?: string | null
          created_at?: string
          id?: string
          is_template?: boolean | null
          name: string
          payload?: Json
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          coach_id?: string | null
          created_at?: string
          id?: string
          is_template?: boolean | null
          name?: string
          payload?: Json
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocols_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      skinfold_measurements: {
        Row: {
          abdominal: number | null
          biceps: number | null
          body_fat_percentage: number | null
          calf: number | null
          chest: number | null
          created_at: string
          id: string
          measurement_date: string
          midaxillary: number | null
          protocol_used: string | null
          subscapular: number | null
          suprailiac: number | null
          thigh: number | null
          triceps: number | null
          user_id: string
          weight: number | null
        }
        Insert: {
          abdominal?: number | null
          biceps?: number | null
          body_fat_percentage?: number | null
          calf?: number | null
          chest?: number | null
          created_at?: string
          id?: string
          measurement_date?: string
          midaxillary?: number | null
          protocol_used?: string | null
          subscapular?: number | null
          suprailiac?: number | null
          thigh?: number | null
          triceps?: number | null
          user_id: string
          weight?: number | null
        }
        Update: {
          abdominal?: number | null
          biceps?: number | null
          body_fat_percentage?: number | null
          calf?: number | null
          chest?: number | null
          created_at?: string
          id?: string
          measurement_date?: string
          midaxillary?: number | null
          protocol_used?: string | null
          subscapular?: number | null
          suprailiac?: number | null
          thigh?: number | null
          triceps?: number | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      student_dismissed_alerts: {
        Row: {
          alert_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          alert_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          alert_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          full_name: string
          gender: string
          height: number | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          full_name: string
          gender: string
          height?: number | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string
          gender?: string
          height?: number | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_type: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workout_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: []
      }
      workout_template_versions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          scope: string
          template_id: string
          treinos: Json
          updated_by: string | null
          updated_by_name: string | null
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          scope?: string
          template_id: string
          treinos?: Json
          updated_by?: string | null
          updated_by_name?: string | null
          version: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          scope?: string
          template_id?: string
          treinos?: Json
          updated_by?: string | null
          updated_by_name?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          level: string
          name: string
          treinos: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          level?: string
          name: string
          treinos?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          level?: string
          name?: string
          treinos?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      student_alert_view: {
        Row: {
          alert_level: string | null
          full_name: string | null
          last_meal_at: string | null
          last_workout_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_level?: never
          full_name?: string | null
          last_meal_at?: never
          last_workout_at?: never
          user_id?: string | null
        }
        Update: {
          alert_level?: never
          full_name?: string | null
          last_meal_at?: never
          last_workout_at?: never
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_coach_by_invite_code: {
        Args: { p_code: string }
        Returns: {
          coach_id: string
          coach_name: string
          notification_email: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "coach"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "coach"],
    },
  },
} as const

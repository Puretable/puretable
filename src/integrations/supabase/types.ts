export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          city: string;
          avatar_path: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          city?: string;
          avatar_path?: string | null;
          created_at?: string;
        };
        Update: { display_name?: string; city?: string; avatar_path?: string | null };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          entity: string | null;
          entity_id: string | null;
          entity_label: string | null;
          id: string;
          user_email: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          entity_label?: string | null;
          id?: string;
          user_email?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          entity_label?: string | null;
          id?: string;
          user_email?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          business_id: string | null;
          city: string | null;
          created_at: string;
          dedupe_key: string | null;
          event_type: string;
          id: string;
          is_admin: boolean;
          label: string | null;
          link_id: string | null;
          metadata: Json;
          path: string | null;
          platform: string | null;
          query: string | null;
          referrer: string | null;
          session_id: string | null;
          user_agent: string | null;
          visitor_id: string | null;
        };
        Insert: {
          business_id?: string | null;
          city?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          event_type: string;
          id?: string;
          is_admin?: boolean;
          label?: string | null;
          link_id?: string | null;
          metadata?: Json;
          path?: string | null;
          platform?: string | null;
          query?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          user_agent?: string | null;
          visitor_id?: string | null;
        };
        Update: {
          business_id?: string | null;
          city?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          event_type?: string;
          id?: string;
          is_admin?: boolean;
          label?: string | null;
          link_id?: string | null;
          metadata?: Json;
          path?: string | null;
          platform?: string | null;
          query?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          user_agent?: string | null;
          visitor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "business_links";
            referencedColumns: ["id"];
          },
        ];
      };
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      business_branches: {
        Row: {
          address: string | null;
          address_ar: string | null;
          business_id: string;
          city: string | null;
          city_ar: string | null;
          created_at: string;
          district: string | null;
          district_ar: string | null;
          hours: Json;
          id: string;
          lat: number | null;
          lng: number | null;
          maps_url: string | null;
          name: string;
          name_ar: string | null;
          permanently_closed: boolean;
          plan_limited: boolean;
          phone: string | null;
          place_id: string | null;
          published: boolean;
          region: string | null;
          sort_order: number;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          address?: string | null;
          address_ar?: string | null;
          business_id: string;
          city?: string | null;
          city_ar?: string | null;
          created_at?: string;
          district?: string | null;
          district_ar?: string | null;
          hours?: Json;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          maps_url?: string | null;
          name: string;
          name_ar?: string | null;
          permanently_closed?: boolean;
          plan_limited?: boolean;
          phone?: string | null;
          place_id?: string | null;
          published?: boolean;
          region?: string | null;
          sort_order?: number;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          address?: string | null;
          address_ar?: string | null;
          business_id?: string;
          city?: string | null;
          city_ar?: string | null;
          created_at?: string;
          district?: string | null;
          district_ar?: string | null;
          hours?: Json;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          maps_url?: string | null;
          name?: string;
          name_ar?: string | null;
          permanently_closed?: boolean;
          plan_limited?: boolean;
          phone?: string | null;
          place_id?: string | null;
          published?: boolean;
          region?: string | null;
          sort_order?: number;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_branches_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_links: {
        Row: {
          branch_id: string | null;
          business_id: string;
          created_at: string;
          id: string;
          label: string | null;
          platform: string;
          product_name: string | null;
          sort_order: number;
          url: string;
        };
        Insert: {
          branch_id?: string | null;
          business_id: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          platform: string;
          product_name?: string | null;
          sort_order?: number;
          url: string;
        };
        Update: {
          branch_id?: string | null;
          business_id?: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          platform?: string;
          product_name?: string | null;
          sort_order?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_links_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_links_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          address: string | null;
          address_ar: string | null;
          categories: string[];
          category: string;
          cities: string[];
          city: string;
          city_ar: string | null;
          cover_url: string | null;
          created_at: string;
          dedicated_gf: boolean;
          description: string | null;
          description_ar: string | null;
          discount_code: string | null;
          district: string | null;
          district_ar: string | null;
          hours: Json;
          id: string;
          instagram: string | null;
          lat: number | null;
          lng: number | null;
          maps_url: string | null;
          name: string;
          name_ar: string | null;
          needs_review: boolean;
          no_location: boolean;
          offers_booking: boolean;
          phone: string | null;
          photos: string[];
          plan: string;
          precautions_note: string | null;
          products: string | null;
          products_ar: string | null;
          published: boolean;
          region: string | null;
          review_notes: string[];
          safety: string;
          shared_kitchen: boolean;
          slug: string;
          updated_at: string;
          verified: boolean;
          website: string | null;
          whatsapp: string | null;
        };
        Insert: {
          address?: string | null;
          address_ar?: string | null;
          categories?: string[];
          category: string;
          cities?: string[];
          city: string;
          city_ar?: string | null;
          cover_url?: string | null;
          created_at?: string;
          dedicated_gf?: boolean;
          description?: string | null;
          description_ar?: string | null;
          discount_code?: string | null;
          district?: string | null;
          district_ar?: string | null;
          hours?: Json;
          id?: string;
          instagram?: string | null;
          lat?: number | null;
          lng?: number | null;
          maps_url?: string | null;
          name: string;
          name_ar?: string | null;
          needs_review?: boolean;
          no_location?: boolean;
          offers_booking?: boolean;
          phone?: string | null;
          photos?: string[];
          plan?: string;
          precautions_note?: string | null;
          products?: string | null;
          products_ar?: string | null;
          published?: boolean;
          region?: string | null;
          review_notes?: string[];
          safety?: string;
          shared_kitchen?: boolean;
          slug: string;
          updated_at?: string;
          verified?: boolean;
          website?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          address?: string | null;
          address_ar?: string | null;
          categories?: string[];
          category?: string;
          cities?: string[];
          city?: string;
          city_ar?: string | null;
          cover_url?: string | null;
          created_at?: string;
          dedicated_gf?: boolean;
          description?: string | null;
          description_ar?: string | null;
          discount_code?: string | null;
          district?: string | null;
          district_ar?: string | null;
          hours?: Json;
          id?: string;
          instagram?: string | null;
          lat?: number | null;
          lng?: number | null;
          maps_url?: string | null;
          name?: string;
          name_ar?: string | null;
          needs_review?: boolean;
          no_location?: boolean;
          offers_booking?: boolean;
          phone?: string | null;
          photos?: string[];
          plan?: string;
          precautions_note?: string | null;
          products?: string | null;
          products_ar?: string | null;
          published?: boolean;
          region?: string | null;
          review_notes?: string[];
          safety?: string;
          shared_kitchen?: boolean;
          slug?: string;
          updated_at?: string;
          verified?: boolean;
          website?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      cities: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          name_ar: string | null;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          name_ar?: string | null;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          name_ar?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      business_disclosure: {
        Row: {
          id: string;
          active: boolean;
          business_name: string | null;
          owner_name: string | null;
          cr_number: string | null;
          address: string | null;
          email: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          active?: boolean;
          business_name?: string | null;
          owner_name?: string | null;
          cr_number?: string | null;
          address?: string | null;
          email?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          active?: boolean;
          business_name?: string | null;
          owner_name?: string | null;
          cr_number?: string | null;
          address?: string | null;
          email?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      complaints: {
        Row: {
          admin_notes: string | null;
          complaint_type: string;
          created_at: string;
          details: string;
          email: string | null;
          full_name: string;
          id: string;
          initial_response_at: string | null;
          order_reference: string | null;
          phone: string;
          resolved_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          complaint_type: string;
          created_at?: string;
          details: string;
          email?: string | null;
          full_name: string;
          id?: string;
          initial_response_at?: string | null;
          order_reference?: string | null;
          phone: string;
          resolved_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          complaint_type?: string;
          created_at?: string;
          details?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          initial_response_at?: string | null;
          order_reference?: string | null;
          phone?: string;
          resolved_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          message: string;
          name: string;
          read: boolean;
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          message: string;
          name: string;
          read?: boolean;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          message?: string;
          name?: string;
          read?: boolean;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      faqs: {
        Row: {
          answer_ar: string;
          answer_en: string;
          created_at: string;
          id: string;
          question_ar: string;
          question_en: string;
          sort_order: number;
          updated_at: string;
          visible: boolean;
        };
        Insert: {
          answer_ar: string;
          answer_en?: string;
          created_at?: string;
          id?: string;
          question_ar: string;
          question_en?: string;
          sort_order?: number;
          updated_at?: string;
          visible?: boolean;
        };
        Update: {
          answer_ar?: string;
          answer_en?: string;
          created_at?: string;
          id?: string;
          question_ar?: string;
          question_en?: string;
          sort_order?: number;
          updated_at?: string;
          visible?: boolean;
        };
        Relationships: [];
      };
      email_deliveries: {
        Row: {
          created_at: string;
          error: string | null;
          event_key: string;
          id: string;
          metadata: Json;
          notification_type: string;
          provider_id: string | null;
          recipient: string;
          sent_at: string | null;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event_key: string;
          id?: string;
          metadata?: Json;
          notification_type: string;
          provider_id?: string | null;
          recipient: string;
          sent_at?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event_key?: string;
          id?: string;
          metadata?: Json;
          notification_type?: string;
          provider_id?: string | null;
          recipient?: string;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      place_categories: {
        Row: {
          behavior: string;
          created_at: string;
          description_ar: string;
          description_en: string;
          icon: string;
          id: string;
          level: string;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order: number;
          updated_at: string;
          value: string;
          visible: boolean;
        };
        Insert: {
          behavior?: string;
          created_at?: string;
          description_ar?: string;
          description_en?: string;
          icon?: string;
          id?: string;
          level: string;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          value: string;
          visible?: boolean;
        };
        Update: {
          behavior?: string;
          created_at?: string;
          description_ar?: string;
          description_en?: string;
          icon?: string;
          id?: string;
          level?: string;
          name_ar?: string;
          name_en?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          value?: string;
          visible?: boolean;
        };
        Relationships: [];
      };
      partner_leads: {
        Row: {
          business_name: string;
          business_type: string | null;
          city: string | null;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          instagram: string | null;
          notes: string | null;
          phone: string | null;
          status: string;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          business_name: string;
          business_type?: string | null;
          city?: string | null;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          instagram?: string | null;
          notes?: string | null;
          phone?: string | null;
          status?: string;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          business_name?: string;
          business_type?: string | null;
          city?: string | null;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          instagram?: string | null;
          notes?: string | null;
          phone?: string | null;
          status?: string;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          content: Json;
          created_at: string;
          draft: Json | null;
          id: string;
          layout: Json;
          sections: Json;
          theme: Json;
          updated_at: string;
        };
        Insert: {
          content?: Json;
          created_at?: string;
          draft?: Json | null;
          id?: string;
          layout?: Json;
          sections?: Json;
          theme?: Json;
          updated_at?: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          draft?: Json | null;
          id?: string;
          layout?: Json;
          sections?: Json;
          theme?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      success_partners: {
        Row: {
          active: boolean;
          business_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          link_url: string | null;
          logo_url: string | null;
          name: string;
          name_ar: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          link_url?: string | null;
          logo_url?: string | null;
          name: string;
          name_ar?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link_url?: string | null;
          logo_url?: string | null;
          name?: string;
          name_ar?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "success_partners_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          city: string | null;
          created_at: string;
          email: string;
          id: string;
          source: string | null;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          source?: string | null;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          source?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_dashboard: { Args: { _since: string }; Returns: Json };
      business_report: {
        Args: { _business_id: string; _since: string };
        Returns: Json;
      };
      claim_admin_role: { Args: never; Returns: boolean };
      get_site_draft: { Args: never; Returns: Json };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;

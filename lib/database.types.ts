export type Profile = {
  id: string;
  user_id: string;
  email: string | null;
  phone: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  linkedin_url: string | null;
  name: string;
  headline: string | null;
  cv_url: string | null;
  cv_text: string | null;
  cv_score: number | null;
  sectors: string[];
  donors: string[];
  countries: string[];
  skills: string[];
  qualifications: string | null;
  years_of_experience: number | null;
  profile_type:
    | "Expert"
    | "Senior"
    | "Mid-level"
    | "Junior"
    | "Entry"
    | null;
  profile_score_pct: number;
  recommended_by: string | null;
  source: string;
  is_public: boolean;
  version: number;
  cv_structured_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Opportunity = {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  organization: string | null;
  donor: string | null;
  country: string | null;
  sectors: string[];
  type: "job" | "consulting" | "tender" | null;
  experience_level: string | null;
  source_domain: string;
  source_url: string;
  scraped_at: string;
  is_active: boolean;
};

export type Subscription = {
  id: string;
  email: string | null;
  telegram_id: string | null;
  sectors_filter: string[];
  donor_filter: string[];
  country_filter: string[];
  channel: "telegram" | "email" | "both";
  is_active: boolean;
  created_at: string;
};

export type CvScore = {
  id: string;
  profile_id: string | null;
  user_id: string | null;
  overall_score: number | null;
  dimensions: Record<string, unknown> | null;
  improvements: Record<string, unknown> | null;
  donor_tips: Record<string, unknown> | null;
  cv_text: string | null;
  file_name: string | null;
  scored_at: string;
};

export type ProfileEdit = {
  id: string;
  profile_id: string;
  version: number;
  changed_fields: string[];
  snapshot: Record<string, unknown> | null;
  edited_at: string;
};

export type SavedOpportunity = {
  id: string;
  user_id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_org: string;
  opportunity_deadline: string | null;
  opportunity_url: string;
  saved_at: string;
  notes: string | null;
};

export type Database = {
  public: {
    Tables: {
      saved_opportunities: {
        Row: SavedOpportunity;
        Insert: Omit<SavedOpportunity, "id" | "saved_at">;
        Update: Partial<SavedOpportunity>;
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { name: string; user_id?: string | null };
        Update: Partial<Profile>;
      };
      profile_edits: {
        Row: ProfileEdit;
        Insert: Partial<ProfileEdit> & {
          profile_id: string;
          version: number;
        };
        Update: Partial<ProfileEdit>;
      };
      opportunities: {
        Row: Opportunity;
        Insert: Partial<Opportunity> & {
          title: string;
          source_domain: string;
          source_url: string;
        };
        Update: Partial<Opportunity>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription>;
        Update: Partial<Subscription>;
      };
      cv_scores: {
        Row: CvScore;
        Insert: Partial<CvScore>;
        Update: Partial<CvScore>;
      };
    };
  };
};

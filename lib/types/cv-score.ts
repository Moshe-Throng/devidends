export interface CvDimension {
  name: string;
  score: number;
  weight: number;
  gaps: string[];
  suggestions: string[];
}

export interface DonorTips {
  [donor: string]: string;
}

export interface OpportunityFit {
  match_percentage: number;
  matching_strengths: string[];
  missing_requirements: string[];
  recommendation: string;
}

export interface CvScoreResult {
  overall_score: number;
  dimensions: CvDimension[];
  top_3_improvements: string[];
  donor_specific_tips: DonorTips;
  opportunity_fit?: OpportunityFit;
}

export interface OpportunityInput {
  title: string;
  organization: string;
  description: string;
  deadline?: string | null;
  source_url?: string;
}

export interface ScoreResponse {
  success: true;
  data: CvScoreResult & { cv_text: string };
}

export interface ScoreErrorResponse {
  success: false;
  error: string;
}

export interface SampleOpportunity {
  id: string;
  title: string;
  organization: string;
  description: string;
  deadline: string | null;
  country: string;
  source_url: string;
  source_domain: string;
  type: string;
  quality_score: number;
  seniority: string | null;
  experience_years: number | null;
  is_expired: boolean;
  classified_type: string;
}

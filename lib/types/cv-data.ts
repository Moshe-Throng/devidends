/* ─── Proficiency levels (WB/UN standard scale) ──────────── */

export type ProficiencyLevel = "Excellent" | "Good" | "Fair" | "None";

/* ─── CV Sections ────────────────────────────────────────── */

export interface PersonalInfo {
  full_name: string;
  nationality: string;
  date_of_birth: string; // ISO date "1985-03-15" or free text
  email: string;
  phone: string;
  address: string;
  country_of_residence: string;
}

export interface Education {
  id: string;
  degree: string;
  field_of_study: string;
  institution: string;
  country: string;
  year_graduated: number;
}

export interface Employment {
  id: string;
  from_date: string; // "2018-01" month precision
  to_date: string; // "2021-06" or "Present"
  employer: string;
  position: string;
  country: string;
  description_of_duties: string;
}

export interface Language {
  id: string;
  language: string;
  reading: ProficiencyLevel;
  writing: ProficiencyLevel;
  speaking: ProficiencyLevel;
}

/* ─── Full structured CV ─────────────────────────────────── */

export interface StructuredCvData {
  personal: PersonalInfo;
  professional_summary: string;
  education: Education[];
  employment: Employment[];
  languages: Language[];
  key_qualifications: string;
  certifications: string[];
  countries_of_experience: string[];
  professional_associations: string[];
  publications: string[];
}

/* ─── API contracts ──────────────────────────────────────── */

export interface ExtractCvResponse {
  success: true;
  data: StructuredCvData;
  raw_text: string;
  confidence: number; // 0-1
}

export interface ExtractCvError {
  success: false;
  error: string;
}

export type CvTemplate =
  | "wb-standard"
  | "europass"
  | "au-standard"
  | "un-php"
  | "generic-professional"
  | "modern-executive";

export interface GenerateDocxRequest {
  cv_data: StructuredCvData;
  template: CvTemplate;
  custom_template_base64?: string;
}

export interface GenerateDocxResponse {
  success: true;
  filename: string;
  docx_base64: string;
}

export interface GenerateDocxError {
  success: false;
  error: string;
}

/* ─── UI phase state ─────────────────────────────────────── */

export type BuilderPhase =
  | "entry"
  | "uploading"
  | "extracting"
  | "editing"
  | "template"
  | "generating"
  | "download";

/* ─── Empty defaults ─────────────────────────────────────── */

export function emptyPersonalInfo(): PersonalInfo {
  return {
    full_name: "",
    nationality: "",
    date_of_birth: "",
    email: "",
    phone: "",
    address: "",
    country_of_residence: "",
  };
}

export function emptyCvData(): StructuredCvData {
  return {
    personal: emptyPersonalInfo(),
    professional_summary: "",
    education: [],
    employment: [],
    languages: [],
    key_qualifications: "",
    certifications: [],
    countries_of_experience: [],
    professional_associations: [],
    publications: [],
  };
}

export function newEducation(): Education {
  return {
    id: crypto.randomUUID(),
    degree: "",
    field_of_study: "",
    institution: "",
    country: "",
    year_graduated: new Date().getFullYear(),
  };
}

export function newEmployment(): Employment {
  return {
    id: crypto.randomUUID(),
    from_date: "",
    to_date: "Present",
    employer: "",
    position: "",
    country: "",
    description_of_duties: "",
  };
}

export function newLanguage(): Language {
  return {
    id: crypto.randomUUID(),
    language: "",
    reading: "None",
    writing: "None",
    speaking: "None",
  };
}

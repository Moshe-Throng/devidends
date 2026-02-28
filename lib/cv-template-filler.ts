import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { StructuredCvData } from "./types/cv-data";

/**
 * Fill a DOCX template (with {{placeholder}} tags) using docxtemplater.
 *
 * Supported tags in templates:
 *   Single values:  {{full_name}}, {{nationality}}, {{date_of_birth}},
 *                   {{email}}, {{phone}}, {{address}}, {{country_of_residence}},
 *                   {{professional_summary}}, {{key_qualifications}},
 *                   {{countries_of_experience_text}},
 *                   {{professional_associations_text}},
 *                   {{publications_text}}
 *
 *   Loops:  {#education}...{/education}  — fields: degree, field_of_study, institution, country, year_graduated
 *           {#employment}...{/employment} — fields: from_date, to_date, employer, position, country, description_of_duties
 *           {#languages}...{/languages}   — fields: language, reading, writing, speaking
 */
export function fillCvTemplate(
  templateBuffer: Buffer,
  data: StructuredCvData
): Buffer {
  const zip = new PizZip(templateBuffer);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Silently replace missing tags with empty string
    nullGetter() {
      return "";
    },
  });

  // Flatten data for template tags
  const templateData = {
    // Personal info (flat)
    full_name: data.personal.full_name,
    nationality: data.personal.nationality,
    date_of_birth: data.personal.date_of_birth,
    email: data.personal.email,
    phone: data.personal.phone,
    address: data.personal.address,
    country_of_residence: data.personal.country_of_residence,

    // Text sections
    professional_summary: data.professional_summary,
    key_qualifications: data.key_qualifications,

    // Arrays as comma-separated text (for simple templates)
    certifications_text: data.certifications.join("\n"),
    countries_of_experience_text: data.countries_of_experience.join(", "),
    professional_associations_text: data.professional_associations.join("\n"),
    publications_text: data.publications.join("\n"),

    // Loop arrays (for advanced templates with {#education}...{/education})
    education: data.education.map((e) => ({
      degree: e.degree,
      field_of_study: e.field_of_study,
      institution: e.institution,
      country: e.country,
      year_graduated: String(e.year_graduated),
    })),

    employment: data.employment.map((emp) => ({
      from_date: emp.from_date,
      to_date: emp.to_date,
      employer: emp.employer,
      position: emp.position,
      country: emp.country,
      description_of_duties: emp.description_of_duties,
    })),

    languages: data.languages.map((l) => ({
      language: l.language,
      reading: l.reading,
      writing: l.writing,
      speaking: l.speaking,
    })),

    certifications: data.certifications.map((c) => ({ name: c })),
  };

  doc.render(templateData);

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf as Buffer;
}

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  TableLayoutType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  VerticalAlign,
} from "docx";
import type { StructuredCvData, CvTemplate } from "./types/cv-data";
import { AU_LOGO_BASE64 } from "./au-logo-data";

/* ─── Style helpers ──────────────────────────────────────── */

const FONT = "Arial";
const BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "999999",
};
const CELL_BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
};

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22,
        font: FONT,
        color: "27ABD2",
      }),
    ],
  });
}

function labelCell(text: string, width?: number): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    width: width
      ? { size: width, type: WidthType.DXA }
      : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, bold: true, size: 20, font: FONT }),
        ],
      }),
    ],
  });
}

function valueCell(text: string, width?: number): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    width: width
      ? { size: width, type: WidthType.DXA }
      : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, font: FONT })],
      }),
    ],
  });
}

function headerRow(labels: string[]): TableRow {
  return new TableRow({
    children: labels.map(
      (l) =>
        new TableCell({
          borders: CELL_BORDERS,
          shading: { fill: "E8F7FA" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: l, bold: true, size: 20, font: FONT }),
              ],
            }),
          ],
        })
    ),
  });
}

/* ─── Main generator ─────────────────────────────────────── */

export async function generateWbCvDocx(
  data: StructuredCvData
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // ── Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "CURRICULUM VITAE",
          bold: true,
          size: 28,
          font: FONT,
        }),
      ],
    })
  );

  // ── Personal Information
  children.push(heading("1. Personal Information"));

  const p = data.personal;
  const infoRows = [
    ["Full Name", p.full_name],
    ["Nationality", p.nationality],
    ["Date of Birth", p.date_of_birth],
    ["Email", p.email],
    ["Phone", p.phone],
    ["Address", p.address],
    ["Country of Residence", p.country_of_residence],
  ].filter(([, v]) => v);

  if (infoRows.length > 0) {
    children.push(
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: infoRows.map(
          ([label, value]) =>
            new TableRow({
              children: [labelCell(label, 3000), valueCell(value, 6000)],
            })
        ),
      })
    );
  }

  // ── Professional Summary
  if (data.professional_summary) {
    children.push(heading("2. Professional Summary"));
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: data.professional_summary,
            size: 20,
            font: FONT,
          }),
        ],
      })
    );
  }

  // ── Education
  if (data.education.length > 0) {
    children.push(heading("3. Education"));
    children.push(
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          headerRow(["Degree", "Field of Study", "Institution", "Country", "Year"]),
          ...data.education.map(
            (e) =>
              new TableRow({
                children: [
                  valueCell(e.degree),
                  valueCell(e.field_of_study),
                  valueCell(e.institution),
                  valueCell(e.country),
                  valueCell(String(e.year_graduated)),
                ],
              })
          ),
        ],
      })
    );
  }

  // ── Employment Record
  if (data.employment.length > 0) {
    children.push(heading("4. Employment Record"));

    for (const emp of data.employment) {
      const period = `${emp.from_date} – ${emp.to_date}`;
      children.push(
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: 9000, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: [
                labelCell("Period", 2000),
                valueCell(period, 2500),
                labelCell("Employer", 1500),
                valueCell(emp.employer, 3000),
              ],
            }),
            new TableRow({
              children: [
                labelCell("Position", 2000),
                valueCell(emp.position, 2500),
                labelCell("Country", 1500),
                valueCell(emp.country, 3000),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: CELL_BORDERS,
                  columnSpan: 4,
                  children: (() => {
                    // Split duties into paragraphs for readability
                    const dutyLines = emp.description_of_duties
                      .split(/\n/)
                      .map(s => s.replace(/^[\s•\-*]+/, "").trim())
                      .filter(Boolean);
                    if (dutyLines.length <= 1) {
                      // Single block — split on sentences for paragraph breaks
                      const sentences = emp.description_of_duties
                        .split(/(?<=\.)\s+/)
                        .map(s => s.trim())
                        .filter(Boolean);
                      return [
                        new Paragraph({
                          spacing: { after: 40 },
                          children: [new TextRun({ text: "Description of Duties:", bold: true, size: 20, font: FONT })],
                        }),
                        ...sentences.map(s => new Paragraph({
                          spacing: { after: 40 },
                          children: [new TextRun({ text: s, size: 20, font: FONT })],
                        })),
                      ];
                    }
                    return [
                      new Paragraph({
                        spacing: { after: 40 },
                        children: [new TextRun({ text: "Description of Duties:", bold: true, size: 20, font: FONT })],
                      }),
                      ...dutyLines.map(d => new Paragraph({
                        bullet: { level: 0 },
                        spacing: { after: 30 },
                        children: [new TextRun({ text: d, size: 20, font: FONT })],
                      })),
                    ];
                  })(),
                }),
              ],
            }),
          ],
        })
      );

      children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    }
  }

  // ── Languages
  if (data.languages.length > 0) {
    children.push(heading("5. Languages"));
    children.push(
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          headerRow(["Language", "Reading", "Writing", "Speaking"]),
          ...data.languages.map(
            (l) =>
              new TableRow({
                children: [
                  valueCell(l.language),
                  valueCell(l.reading),
                  valueCell(l.writing),
                  valueCell(l.speaking),
                ],
              })
          ),
        ],
      })
    );
  }

  // ── Key Qualifications
  if (data.key_qualifications) {
    children.push(heading("6. Key Qualifications"));
    const qualLines = data.key_qualifications
      .split(/\n/)
      .map(s => s.replace(/^[\s•\-*]+/, "").trim())
      .filter(Boolean);
    if (qualLines.length > 1) {
      for (const q of qualLines) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: q, size: 20, font: FONT })] }));
      }
    } else {
      // Single block — split on sentences
      const sentences = data.key_qualifications.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
      for (const s of sentences) {
        children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: s, size: 20, font: FONT })] }));
      }
    }
  }

  // ── Certifications & Accreditations
  if (data.certifications.length > 0) {
    children.push(heading("7. Certifications & Accreditations"));
    for (const cert of data.certifications) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: cert, size: 20, font: FONT })],
        })
      );
    }
  }

  // ── Countries of Work Experience
  if (data.countries_of_experience.length > 0) {
    children.push(heading("8. Countries of Work Experience"));
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: data.countries_of_experience.join(", "),
            size: 20,
            font: FONT,
          }),
        ],
      })
    );
  }

  // ── Professional Associations
  if (data.professional_associations.length > 0) {
    children.push(heading("9. Professional Associations"));
    for (const a of data.professional_associations) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: a, size: 20, font: FONT })],
        })
      );
    }
  }

  // ── Publications
  if (data.publications.length > 0) {
    children.push(heading("10. Publications"));
    for (const pub of data.publications) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: pub, size: 20, font: FONT })],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/* ═══════════════════════════════════════════════════════════
   EUROPASS TEMPLATE — EuropeAid Consultant CV Format
   Standard EU development consultant format (GIZ, EC, UN-funded projects)
   Blue theme (#003399), CEFR language grid, professional experience table
   ═══════════════════════════════════════════════════════════ */

const EU_BLUE = "164194";
const EU_LIGHT = "E8EEF7";
const EU_BORDER = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const EU_BORDERS = { top: EU_BORDER, bottom: EU_BORDER, left: EU_BORDER, right: EU_BORDER };

/** Blue-background section heading bar (EuropeAid style) */
function epSection(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 80 },
    shading: { fill: EU_BLUE, type: ShadingType.CLEAR, color: "auto" },
    children: [
      new TextRun({ text: `  ${title.toUpperCase()}`, bold: true, size: 22, font: "Arial", color: "FFFFFF" }),
    ],
  });
}

/** Two-column label/value table for personal info */
function epInfoTable(rows: [string, string][]): Table {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: EU_BORDERS,
            width: { size: 2600, type: WidthType.DXA },
            shading: { fill: EU_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Arial", color: EU_BLUE })] })],
          }),
          new TableCell({
            borders: EU_BORDERS,
            width: { size: 6400, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: "Arial" })] })],
          }),
        ],
      })
    ),
  });
}

/** Blue header cell for table column headers */
function epHeaderCell(text: string, width: number): TableCell {
  return new TableCell({
    borders: EU_BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: EU_BLUE, type: ShadingType.CLEAR, color: "auto" },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })],
  });
}

export async function generateEuropassDocx(data: StructuredCvData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const p = data.personal;

  // ── Header ─────────────────────────────────────────────────
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: "CURRICULUM VITAE", bold: true, size: 44, font: "Arial", color: EU_BLUE })],
  }));

  // ── Personal Information ────────────────────────────────────
  children.push(epSection("Personal Information"));

  // Split full_name into family name (last token) and first name(s)
  const nameParts = p.full_name.trim().split(/\s+/);
  const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : p.full_name;
  const firstNames = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : p.full_name;

  const personalRows: [string, string][] = [
    ["Family name:", familyName],
    ["First name(s):", firstNames],
    ...(p.date_of_birth ? [["Date of birth:", p.date_of_birth] as [string, string]] : []),
    ...(p.nationality ? [["Nationality:", p.nationality] as [string, string]] : []),
    ...(p.phone ? [["Phone:", p.phone] as [string, string]] : []),
    ...(p.email ? [["Email:", p.email] as [string, string]] : []),
    ...(p.address ? [["Address:", p.address] as [string, string]] : []),
  ];
  children.push(epInfoTable(personalRows));

  // ── Education ───────────────────────────────────────────────
  if (data.education.length > 0) {
    children.push(epSection("Education"));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            epHeaderCell("Institution (Date)", 3600),
            epHeaderCell("Degree(s) or Diploma(s) obtained", 5400),
          ],
        }),
        ...data.education.map(edu =>
          new TableRow({
            children: [
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 3600, type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: edu.institution, bold: true, size: 20, font: "Arial" })] }),
                  new Paragraph({ children: [new TextRun({ text: `${edu.country ? edu.country + ", " : ""}${edu.year_graduated}`, size: 18, font: "Arial", color: "555555" })] }),
                ],
              }),
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 5400, type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: edu.degree, bold: true, size: 20, font: "Arial" })] }),
                  ...(edu.field_of_study ? [new Paragraph({ children: [new TextRun({ text: edu.field_of_study, size: 18, font: "Arial", color: "444444" })] })] : []),
                ],
              }),
            ],
          })
        ),
      ],
    }));
  }

  // ── Language Skills ─────────────────────────────────────────
  if (data.languages.length > 0) {
    children.push(epSection("Language Skills"));
    children.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: "Indicate competence on a scale of C2 to A1 (C2 – excellent; A1 – basic)", italics: true, size: 18, font: "Arial", color: "666666" })],
    }));
    const langColW = [3000, 2000, 2000, 2000];
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Language", "Reading", "Speaking", "Writing"].map((h, i) =>
            new TableCell({
              borders: EU_BORDERS,
              width: { size: langColW[i], type: WidthType.DXA },
              shading: { fill: EU_BLUE, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })],
            })
          ),
        }),
        ...data.languages.map(l =>
          new TableRow({
            children: [
              new TableCell({ borders: EU_BORDERS, width: { size: langColW[0], type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: l.language, bold: true, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, width: { size: langColW[1], type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.reading, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, width: { size: langColW[2], type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.speaking, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, width: { size: langColW[3], type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.writing, size: 18, font: "Arial" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // ── Qualifications & Skills ─────────────────────────────────
  if (data.key_qualifications) {
    children.push(epSection("Qualifications & Skills"));
    const quals = data.key_qualifications
      .split(/\n/)
      .map(s => s.replace(/^[\s•\-*]+/, "").trim())
      .filter(Boolean);
    for (const q of quals) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: q, size: 20, font: "Arial" })] }));
    }
  }

  // ── General Professional Experience ─────────────────────────
  if (data.professional_summary) {
    children.push(epSection("General Professional Experience"));
    const lines = data.professional_summary
      .split(/\n/)
      .map(s => s.replace(/^[\s•\-*]+/, "").trim())
      .filter(Boolean);
    // If single block of prose, split on sentences ending with period
    const bullets = lines.length === 1
      ? lines[0].split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean)
      : lines;
    for (const b of bullets) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: b, size: 20, font: "Arial" })] }));
    }
  }

  // ── Specific Experience by Region ───────────────────────────
  if (data.countries_of_experience.length > 0) {
    children.push(epSection("Specific Experience in the Region"));

    // Derive dates from employment records — match country names to job date ranges
    const countryDates: Record<string, string[]> = {};
    for (const emp of data.employment) {
      const empCountry = (emp.country || "").trim();
      if (!empCountry) continue;
      const dateRange = `${emp.from_date || ""}${emp.from_date && emp.to_date ? " – " : ""}${emp.to_date || ""}`.trim();
      if (!dateRange) continue;
      // Match against countries_of_experience (case-insensitive partial match)
      for (const c of data.countries_of_experience) {
        if (empCountry.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(empCountry.toLowerCase())) {
          if (!countryDates[c]) countryDates[c] = [];
          if (!countryDates[c].includes(dateRange)) countryDates[c].push(dateRange);
        }
      }
    }

    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [epHeaderCell("Country", 4500), epHeaderCell("Dates", 4500)] }),
        ...data.countries_of_experience.map(country =>
          new TableRow({
            children: [
              new TableCell({ borders: EU_BORDERS, width: { size: 4500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: country, size: 20, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, width: { size: 4500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: (countryDates[country] || []).join("; "), size: 20, font: "Arial" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // ── Professional Experience ─────────────────────────────────
  if (data.employment.length > 0) {
    children.push(epSection("Professional Experience"));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            epHeaderCell("Location / Dates", 2400),
            epHeaderCell("Company & Reference", 2200),
            epHeaderCell("Position / Description", 4400),
          ],
        }),
        ...data.employment.map(emp => {
          const duties = emp.description_of_duties
            .split(/\n/)
            .map(s => s.replace(/^[\s•\-*]+/, "").trim())
            .filter(Boolean);
          const dutyParas = duties.length > 0
            ? duties.map(d => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: d, size: 16, font: "Arial" })] }))
            : [new Paragraph({ children: [new TextRun({ text: emp.description_of_duties, size: 16, font: "Arial" })] })];

          return new TableRow({
            children: [
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 2400, type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: emp.country || "", bold: true, size: 18, font: "Arial" })] }),
                  new Paragraph({ children: [new TextRun({ text: `${emp.from_date} – ${emp.to_date}`, size: 18, font: "Arial", color: EU_BLUE })] }),
                ],
              }),
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 2200, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: emp.employer, bold: true, size: 18, font: "Arial" })] })],
              }),
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 4400, type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: emp.position, bold: true, size: 18, font: "Arial" })] }),
                  ...dutyParas,
                ],
              }),
            ],
          });
        }),
      ],
    }));
  }

  // ── Trainings and Courses ────────────────────────────────────
  if (data.certifications.length > 0) {
    children.push(epSection("Trainings and Courses"));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [epHeaderCell("Training / Course", 5400), epHeaderCell("Provider / Location", 3600)] }),
        ...data.certifications.map(cert => {
          // Split "Course — Provider" or "Course (Provider)" patterns
          const dashMatch = cert.match(/^(.+?)\s*[—–]\s*(.+)$/);
          const parenMatch = !dashMatch && cert.match(/^(.+?)\s*\((.+)\)$/);
          const courseName = dashMatch ? dashMatch[1].trim() : parenMatch ? parenMatch[1].trim() : cert;
          const provider = dashMatch ? dashMatch[2].trim() : parenMatch ? parenMatch[2].trim() : "";
          return new TableRow({
            children: [
              new TableCell({ borders: EU_BORDERS, width: { size: 5400, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: courseName, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: provider, size: 18, font: "Arial" })] })] }),
            ],
          });
        }),
      ],
    }));
  }

  // ── Publications ─────────────────────────────────────────────
  if (data.publications.length > 0) {
    children.push(epSection("Publications"));
    for (const pub of data.publications) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: pub, size: 18, font: "Arial" })] }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 } } },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/* ═══════════════════════════════════════════════════════════
   AFRICAN UNION TEMPLATE — AU Standard Format
   Gold/green theme, nationality emphasis, AU competency framework
   ═══════════════════════════════════════════════════════════ */

const AU_GREEN = "009639";
const AU_GOLD = "C09A36";
const AU_LIGHT_GREEN = "E8F5E9";
const AU_BORDER_STYLE = { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" };
const AU_BORDERS = { top: AU_BORDER_STYLE, bottom: AU_BORDER_STYLE, left: AU_BORDER_STYLE, right: AU_BORDER_STYLE };

/* ── AU Template helpers ─────────────────────────────────── */

const AU_SECTION_GREEN = "6BAB4F"; // official AU section header green
const AU_THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const AU_THIN_BORDERS = { top: AU_THIN_BORDER, bottom: AU_THIN_BORDER, left: AU_THIN_BORDER, right: AU_THIN_BORDER };
const AU_NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const AU_FONT = "Arial";
const AU_FONT_SIZE = 20; // 10pt

/** Green-background section header row spanning the full table width */
function auSectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 60 },
    shading: { fill: AU_SECTION_GREEN, type: ShadingType.CLEAR, color: "auto" },
    children: [
      new TextRun({ text, bold: true, size: AU_FONT_SIZE, font: AU_FONT, color: "FFFFFF" }),
    ],
  });
}

/** Simple bordered cell for AU tables */
function auCell(text: string, opts?: { bold?: boolean; width?: number; shading?: string; alignment?: typeof AlignmentType[keyof typeof AlignmentType]; columnSpan?: number }): TableCell {
  return new TableCell({
    borders: AU_THIN_BORDERS,
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts?.columnSpan,
    shading: opts?.shading ? { fill: opts.shading, type: ShadingType.CLEAR, color: "auto" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts?.alignment ?? AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text, bold: opts?.bold ?? false, size: AU_FONT_SIZE, font: AU_FONT }),
        ],
      }),
    ],
  });
}

/** Multi-paragraph cell (for duties/descriptions) */
function auMultiCell(paragraphs: Paragraph[], opts?: { columnSpan?: number }): TableCell {
  return new TableCell({
    borders: AU_THIN_BORDERS,
    columnSpan: opts?.columnSpan,
    children: paragraphs,
  });
}

/** Table header row with green background */
function auTableHeaderRow(labels: string[]): TableRow {
  return new TableRow({
    children: labels.map(l =>
      new TableCell({
        borders: AU_THIN_BORDERS,
        shading: { fill: AU_SECTION_GREEN, type: ShadingType.CLEAR, color: "auto" },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: l, bold: true, size: AU_FONT_SIZE, font: AU_FONT, color: "FFFFFF" })],
          }),
        ],
      })
    ),
  });
}

export async function generateAuDocx(data: StructuredCvData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const p = data.personal;

  /* ── AU Multilingual Header (inline as table) ─────────── */
  // Row 1: AFRICAN UNION | (logo placeholder) | UNION AFRICAINE
  // Row 2: الاتحاد الأفريقي | | UNIÃO AFRICANA
  // Row 3: UMOJA WA AFRIKA | | UNIÓN AFRICANA
  const headerRows = [
    ["AFRICAN UNION", "UNION AFRICAINE"],
    ["\u0627\u0644\u0627\u062A\u062D\u0627\u062F \u0627\u0644\u0623\u0641\u0631\u064A\u0642\u064A", "UNI\u00C3O AFRICANA"],
    ["UMOJA WA AFRIKA", "UNI\u00D3N AFRICANA"],
  ];

  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9400, type: WidthType.DXA },
    rows: headerRows.map((row, idx) =>
      new TableRow({
        children: [
          new TableCell({
            borders: AU_NO_BORDERS,
            width: { size: 3200, type: WidthType.DXA },
            children: [new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 0, after: 0 },
              children: [new TextRun({ text: row[0], bold: idx === 0, size: idx === 0 ? 22 : 18, font: AU_FONT, color: AU_GREEN })],
            })],
          }),
          new TableCell({
            borders: AU_NO_BORDERS,
            width: { size: 3000, type: WidthType.DXA },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: idx === 0
                ? [new ImageRun({ data: Buffer.from(AU_LOGO_BASE64, "base64"), transformation: { width: 65, height: 59 } })]
                : [],
            })],
          }),
          new TableCell({
            borders: AU_NO_BORDERS,
            width: { size: 3200, type: WidthType.DXA },
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 0, after: 0 },
              children: [new TextRun({ text: row[1], bold: idx === 0, size: idx === 0 ? 22 : 18, font: AU_FONT, color: AU_GREEN })],
            })],
          }),
        ],
      })
    ),
  }));

  // Divider line
  children.push(new Paragraph({
    spacing: { before: 60, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AU_GOLD } },
    children: [],
  }));

  /* ── Title ────────────────────────────────────────────── */
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "Curriculum Vitae (CV) Template", bold: true, italics: true, size: 26, font: AU_FONT })],
  }));

  /* ── Position field (green background) ────────────────── */
  children.push(new Paragraph({
    spacing: { after: 200 },
    shading: { fill: AU_SECTION_GREEN, type: ShadingType.CLEAR, color: "auto" },
    children: [
      new TextRun({ text: "Position: ", bold: true, size: AU_FONT_SIZE, font: AU_FONT, color: "FFFFFF" }),
      new TextRun({ text: "(Indicate the title of the position you are applying for and/or Reference No.)", italics: true, size: AU_FONT_SIZE, font: AU_FONT, color: "FFFFFF" }),
    ],
  }));

  /* ── 1. Personal Details ──────────────────────────────── */
  children.push(auSectionHeading("Personal Details"));

  const personalRows = [
    ["Full Name", p.full_name],
    ["Nationality", p.nationality],
    ["Current Residential Address", p.address || p.country_of_residence],
    ["Phone Numbers", p.phone],
    ["Email Addresses", p.email],
  ].filter(([, v]) => v);

  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9400, type: WidthType.DXA },
    rows: personalRows.map(([label, value]) =>
      new TableRow({
        children: [
          auCell(label, { bold: true, width: 3400 }),
          auCell(value, { width: 6000 }),
        ],
      })
    ),
  }));

  /* ── 2. Professional Summary (max 1500 chars) ─────────── */
  children.push(auSectionHeading("Professional Summary"));
  children.push(new Paragraph({
    spacing: { before: 60, after: 40 },
    children: [new TextRun({ text: "(Please describe yourself in not more than 1500 characters)", italics: true, size: 16, font: AU_FONT, color: "777777" })],
  }));
  if (data.professional_summary) {
    const summary = data.professional_summary.substring(0, 1500);
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: summary, size: AU_FONT_SIZE, font: AU_FONT })],
    }));
  }

  /* ── 3. Membership in Professional Societies ──────────── */
  if (data.professional_associations.length > 0) {
    children.push(auSectionHeading("Membership in Professional Societies"));
    for (const a of data.professional_associations) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 30 },
        children: [new TextRun({ text: a, size: AU_FONT_SIZE, font: AU_FONT })],
      }));
    }
  }

  /* ── 4. Academic and Professional Qualifications ──────── */
  children.push(auSectionHeading("Academic and Professional Qualifications"));
  {
    const eduTableRows: TableRow[] = [
      auTableHeaderRow(["Name of Institution", "Address of Institution", "Qualification Received", "Summary Description", "Year Obtained"]),
    ];
    if (data.education.length > 0) {
      for (const e of data.education) {
        eduTableRows.push(new TableRow({
          children: [
            auCell(e.institution),
            auCell(e.country), // address mapped to country
            auCell(e.degree),
            auCell(e.field_of_study),
            auCell(String(e.year_graduated), { alignment: AlignmentType.CENTER }),
          ],
        }));
      }
    } else {
      eduTableRows.push(new TableRow({ children: [auCell(" "), auCell(" "), auCell(" "), auCell(" "), auCell(" ")] }));
    }
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9400, type: WidthType.DXA },
      rows: eduTableRows,
    }));
  }

  /* ── 5. Other Relevant Trainings/Certifications/Licenses */
  {
    // Combine certifications + professional_associations that contain years
    const allCerts = [...data.certifications];
    // Also pull professional_associations with year patterns as training
    for (const a of data.professional_associations) {
      if (/\b(19|20)\d{2}\b/.test(a) && !allCerts.includes(a)) {
        allCerts.push(a);
      }
    }

    if (allCerts.length > 0) {
      children.push(auSectionHeading("Other Relevant Trainings/Certifications/Licenses"));
      const certRows: TableRow[] = [
        auTableHeaderRow(["Course Title", "Certifying Body or Institution", "Address of Institution", "Year Attended"]),
      ];
      for (const cert of allCerts) {
        const yearMatch = cert.match(/\b(19|20)\d{2}(?:\/\d{2})?\b/);
        const year = yearMatch ? yearMatch[0] : "";
        const title = cert.replace(/\s*\(?\b(19|20)\d{2}(?:\/\d{2})?\b\)?\s*/g, " ").trim();
        // Try to split on common separators to extract institution
        const parts = title.split(/\s*[-–—,]\s*/);
        const courseTitle = parts[0] || title;
        const institution = parts.length > 1 ? parts.slice(1).join(", ") : "";
        certRows.push(new TableRow({
          children: [
            auCell(courseTitle),
            auCell(institution),
            auCell(""),
            auCell(year, { alignment: AlignmentType.CENTER }),
          ],
        }));
      }
      children.push(new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9400, type: WidthType.DXA },
        rows: certRows,
      }));
    }
  }

  /* ── 6. Employment and/or Professional Experiences ───── */
  children.push(auSectionHeading("Employment and/or Professional Experiences"));

  if (data.employment.length > 0) {
    for (const emp of data.employment) {
      // Parse duties into bullet points
      const dutyLines = emp.description_of_duties
        .split(/\n/)
        .map(s => s.replace(/^[\s\u2022\-*]+/, "").trim())
        .filter(Boolean);

      const empRows: TableRow[] = [
        // Employer name row (green header spanning full width)
        new TableRow({
          children: [
            auCell("Name of Organisation/Employer:", { bold: true, width: 3200, shading: AU_SECTION_GREEN }),
            auCell(emp.employer, { bold: true, columnSpan: 3 }),
          ],
        }),
        // Address row
        new TableRow({
          children: [
            auCell("Address:", { bold: true, width: 3200, shading: AU_LIGHT_GREEN }),
            auCell(emp.country || "", { columnSpan: 3 }),
          ],
        }),
        // Position
        new TableRow({
          children: [
            auCell("Position Held", { bold: true, width: 3200, shading: AU_LIGHT_GREEN }),
            auCell(emp.position, { columnSpan: 3 }),
          ],
        }),
        // Duration
        new TableRow({
          children: [
            auCell("Duration", { bold: true, width: 3200, shading: AU_LIGHT_GREEN }),
            auCell(`${emp.from_date} \u2013 ${emp.to_date}`, { columnSpan: 3 }),
          ],
        }),
        // Responsibilities
        new TableRow({
          children: [
            auCell("Responsibilities", { bold: true, width: 3200, shading: AU_LIGHT_GREEN }),
            auMultiCell(
              dutyLines.length > 1
                ? dutyLines.map(d => new Paragraph({
                    bullet: { level: 0 },
                    spacing: { after: 20 },
                    children: [new TextRun({ text: d, size: AU_FONT_SIZE, font: AU_FONT })],
                  }))
                : [new Paragraph({
                    spacing: { after: 40 },
                    children: [new TextRun({ text: emp.description_of_duties || "", size: AU_FONT_SIZE, font: AU_FONT })],
                  })],
              { columnSpan: 3 }
            ),
          ],
        }),
      ];

      children.push(new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9400, type: WidthType.DXA },
        rows: empRows,
      }));
      children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    }
  }

  /* ── 7. Skills, Knowledge and Competencies (max 200 words) */
  children.push(auSectionHeading("Skills, Knowledge and Competencies"));
  children.push(new Paragraph({
    spacing: { before: 40, after: 20 },
    children: [new TextRun({ text: "(Please describe in not more than 200 words)", italics: true, size: 16, font: AU_FONT, color: "777777" })],
  }));
  if (data.key_qualifications) {
    const qualLines = data.key_qualifications
      .split(/\n/)
      .map(s => s.replace(/^[\s\u2022\-*]+/, "").trim())
      .filter(Boolean);
    if (qualLines.length > 1) {
      for (const q of qualLines) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 30 },
          children: [new TextRun({ text: q, size: AU_FONT_SIZE, font: AU_FONT })],
        }));
      }
    } else {
      children.push(new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: data.key_qualifications, size: AU_FONT_SIZE, font: AU_FONT })],
      }));
    }
  } else {
    children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: " ", size: AU_FONT_SIZE, font: AU_FONT })] }));
  }

  /* ── 8. Other Achievements/Accomplishments (max 200 words) */
  // Only show if there's meaningful content
  {
    const achievementParts: string[] = [];
    if (data.countries_of_experience.length > 0) {
      achievementParts.push(`International professional experience across ${data.countries_of_experience.join(", ")}.`);
    }
    // Only render section if there's content
    if (achievementParts.length > 0) {
      children.push(auSectionHeading("Other Achievements/Accomplishments"));
      children.push(new Paragraph({
        spacing: { before: 60, after: 100 },
        children: [new TextRun({ text: achievementParts.join(" "), size: AU_FONT_SIZE, font: AU_FONT })],
      }));
    }
  }

  /* ── 9. Publications (only if data exists) ───────────── */
  if (data.publications.length > 0) {
    children.push(auSectionHeading("Publications"));
    for (const pub of data.publications) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 30 },
        children: [new TextRun({ text: pub, size: AU_FONT_SIZE, font: AU_FONT })],
      }));
    }
  }

  /* ── 10. Working Languages ────────────────────────────── */
  children.push(auSectionHeading("Working Languages"));

  // Build a map of user's languages for lookup
  const langMap = new Map<string, { speaking: string; reading: string; writing: string }>();
  for (const l of data.languages) {
    langMap.set(l.language.toLowerCase(), { speaking: l.speaking, reading: l.reading, writing: l.writing });
  }

  const auWorkingLanguages = ["Arabic", "English", "French", "Kiswahili", "Portuguese", "Spanish"];
  const langRows: TableRow[] = [
    auTableHeaderRow(["Working Languages", "Speaking", "Reading", "Writing"]),
  ];
  for (const lang of auWorkingLanguages) {
    const proficiency = langMap.get(lang.toLowerCase());
    langRows.push(new TableRow({
      children: [
        auCell(lang, { bold: true }),
        auCell(proficiency?.speaking ?? "", { alignment: AlignmentType.CENTER }),
        auCell(proficiency?.reading ?? "", { alignment: AlignmentType.CENTER }),
        auCell(proficiency?.writing ?? "", { alignment: AlignmentType.CENTER }),
      ],
    }));
  }

  // Also add any user languages not in the AU6
  for (const l of data.languages) {
    const isAuLang = auWorkingLanguages.some(al => al.toLowerCase() === l.language.toLowerCase());
    if (!isAuLang) {
      langRows.push(new TableRow({
        children: [
          auCell(l.language, { bold: true }),
          auCell(l.speaking, { alignment: AlignmentType.CENTER }),
          auCell(l.reading, { alignment: AlignmentType.CENTER }),
          auCell(l.writing, { alignment: AlignmentType.CENTER }),
        ],
      }));
    }
  }

  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9400, type: WidthType.DXA },
    rows: langRows,
  }));

  /* ── 11. Referees ─────────────────────────────────────── */
  children.push(auSectionHeading("Referees"));
  children.push(new Paragraph({
    spacing: { before: 40, after: 60 },
    children: [new TextRun({ text: "(Provide details of three referees)", italics: true, size: 16, font: AU_FONT, color: "777777" })],
  }));

  const refereeRows: TableRow[] = [
    auTableHeaderRow(["Full Name", "Position and Organisation", "Email Address", "Telephone Number"]),
  ];
  // Always include 3 empty rows for referees
  for (let i = 0; i < 3; i++) {
    refereeRows.push(new TableRow({
      children: [auCell(" "), auCell(" "), auCell(" "), auCell(" ")],
    }));
  }
  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9400, type: WidthType.DXA },
    rows: refereeRows,
  }));

  /* ── 12. Certification ────────────────────────────────── */
  children.push(auSectionHeading("Certification"));
  children.push(new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({
        text: "I, the undersigned, certify that to the best of my knowledge and belief, this CV correctly describes me, my qualifications, and my experience, and I am available to undertake the assignment as described. I understand that any wilful misstatement described herein may lead to my disqualification or dismissal, if engaged.",
        size: AU_FONT_SIZE,
        font: AU_FONT,
      }),
    ],
  }));

  // Signature fields
  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9400, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          auCell("Full Name:", { bold: true, width: 2400 }),
          auCell(p.full_name, { width: 7000 }),
        ],
      }),
      new TableRow({
        children: [
          auCell("Signature:", { bold: true, width: 2400 }),
          auCell("", { width: 7000 }),
        ],
      }),
      new TableRow({
        children: [
          auCell("Date:", { bold: true, width: 2400 }),
          auCell("", { width: 7000 }),
        ],
      }),
    ],
  }));

  /* ── Build Document ───────────────────────────────────── */
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
          pageNumbers: { start: 1 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
              children: [
                new TextRun({ text: "AFRICAN UNION", bold: true, size: 16, font: AU_FONT, color: AU_GREEN }),
                new TextRun({ text: "  |  ", size: 16, font: AU_FONT, color: "BBBBBB" }),
                new TextRun({ text: "UNION AFRICAINE", bold: true, size: 16, font: AU_FONT, color: AU_GREEN }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", size: 16, font: AU_FONT, color: "777777" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: AU_FONT, color: "777777" }),
                new TextRun({ text: " of ", size: 16, font: AU_FONT, color: "777777" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: AU_FONT, color: "777777" }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/* ═══════════════════════════════════════════════════════════
   UN PERSONAL HISTORY PROFILE (PHP) TEMPLATE
   Formal UN format with structured numbered sections
   ═══════════════════════════════════════════════════════════ */

const UN_BLUE = "4472C4";
const UN_LIGHT = "D9E2F3";
const UN_BORDER_S = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const UN_BORDERS_ALL = { top: UN_BORDER_S, bottom: UN_BORDER_S, left: UN_BORDER_S, right: UN_BORDER_S };

function unSectionHeader(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
    children: [
      new TextRun({ text, bold: true, size: 22, font: "Times New Roman", color: UN_BLUE }),
    ],
  });
}

export async function generateUnPhpDocx(data: StructuredCvData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const p = data.personal;

  // UN Header
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: "UNITED NATIONS", bold: true, size: 28, font: "Times New Roman", color: UN_BLUE })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "PERSONAL HISTORY PROFILE", bold: true, size: 24, font: "Times New Roman" })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.DOUBLE, size: 2, color: UN_BLUE } },
    children: [new TextRun({ text: "INSTRUCTIONS: Please complete this form carefully and type or print clearly.", italics: true, size: 16, font: "Times New Roman", color: "777777" })],
  }));

  // Section I — Personal Information
  children.push(unSectionHeader("I. PERSONAL INFORMATION"));
  const nameParts = p.full_name.split(" ");
  const surname = nameParts.length > 1 ? nameParts.slice(-1).join(" ") : p.full_name;
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";

  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: UN_BORDERS_ALL, width: { size: 1500, type: WidthType.DXA },
            shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "Surname", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL, width: { size: 2800, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: surname, size: 20, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL, width: { size: 1700, type: WidthType.DXA },
            shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "First Name(s)", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL, width: { size: 3000, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: firstName, size: 20, font: "Times New Roman" })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: UN_BORDERS_ALL, shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "Nationality", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL,
            children: [new Paragraph({ children: [new TextRun({ text: p.nationality, size: 20, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL, shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "Date of Birth", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL,
            children: [new Paragraph({ children: [new TextRun({ text: p.date_of_birth, size: 20, font: "Times New Roman" })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: UN_BORDERS_ALL, shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "Email", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL,
            children: [new Paragraph({ children: [new TextRun({ text: p.email, size: 20, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL, shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "Telephone", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL,
            children: [new Paragraph({ children: [new TextRun({ text: p.phone, size: 20, font: "Times New Roman" })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: UN_BORDERS_ALL, shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: "Address", bold: true, size: 18, font: "Times New Roman" })] })] }),
          new TableCell({ borders: UN_BORDERS_ALL, columnSpan: 3,
            children: [new Paragraph({ children: [new TextRun({ text: p.address, size: 20, font: "Times New Roman" })] })] }),
        ],
      }),
    ],
  }));

  // Section II — Education
  if (data.education.length > 0) {
    children.push(unSectionHeader("II. EDUCATION"));
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "Give full details, starting with your most recent education.", italics: true, size: 16, font: "Times New Roman", color: "777777" })],
    }));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Name of Institution", "Degree/Diploma", "Main Course of Study", "Year"].map(h =>
            new TableCell({
              borders: UN_BORDERS_ALL,
              shading: { fill: UN_BLUE, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 16, font: "Times New Roman", color: "FFFFFF" })] })],
            })
          ),
        }),
        ...data.education.map(e =>
          new TableRow({
            children: [
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ children: [new TextRun({ text: `${e.institution}${e.country ? ` (${e.country})` : ""}`, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ children: [new TextRun({ text: e.degree, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ children: [new TextRun({ text: e.field_of_study, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ children: [new TextRun({ text: String(e.year_graduated), size: 18, font: "Times New Roman" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // Section III — Languages
  if (data.languages.length > 0) {
    children.push(unSectionHeader("III. LANGUAGES"));
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "For each language known, indicate proficiency: Excellent, Good, Fair or None.", italics: true, size: 16, font: "Times New Roman", color: "777777" })],
    }));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Language", "Read", "Write", "Speak"].map(h =>
            new TableCell({
              borders: UN_BORDERS_ALL,
              shading: { fill: UN_BLUE, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 16, font: "Times New Roman", color: "FFFFFF" })] })],
            })
          ),
        }),
        ...data.languages.map(l =>
          new TableRow({
            children: [
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ children: [new TextRun({ text: l.language, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.reading, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.writing, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.speaking, size: 18, font: "Times New Roman" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // Section IV — Employment Record
  if (data.employment.length > 0) {
    children.push(unSectionHeader("IV. EMPLOYMENT RECORD"));
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "Starting with your present post, list in reverse chronological order all posts held.", italics: true, size: 16, font: "Times New Roman", color: "777777" })],
    }));

    for (const emp of data.employment) {
      children.push(new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders: UN_BORDERS_ALL, width: { size: 1500, type: WidthType.DXA },
                shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "FROM–TO", bold: true, size: 16, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, width: { size: 2800, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: `${emp.from_date} – ${emp.to_date}`, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, width: { size: 1500, type: WidthType.DXA },
                shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "EMPLOYER", bold: true, size: 16, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL, width: { size: 3200, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: emp.employer, size: 18, font: "Times New Roman" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: UN_BORDERS_ALL,
                shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "TITLE", bold: true, size: 16, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL,
                children: [new Paragraph({ children: [new TextRun({ text: emp.position, bold: true, size: 18, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL,
                shading: { fill: UN_LIGHT, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "LOCATION", bold: true, size: 16, font: "Times New Roman" })] })] }),
              new TableCell({ borders: UN_BORDERS_ALL,
                children: [new Paragraph({ children: [new TextRun({ text: emp.country, size: 18, font: "Times New Roman" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: UN_BORDERS_ALL, columnSpan: 4,
                children: (() => {
                  const header = new Paragraph({ children: [new TextRun({ text: "MAIN DUTIES AND RESPONSIBILITIES:", bold: true, size: 16, font: "Times New Roman", color: UN_BLUE })] });
                  const dutyLines = emp.description_of_duties.split(/\n/).map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
                  if (dutyLines.length > 1) {
                    return [header, ...dutyLines.map(d => new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: d, size: 18, font: "Times New Roman" })] }))];
                  }
                  return [header, new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: emp.description_of_duties, size: 18, font: "Times New Roman" })] })];
                })(),
              }),
            ],
          }),
        ],
      }));
      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    }
  }

  // Section V — Skills & Qualifications
  if (data.key_qualifications) {
    children.push(unSectionHeader("V. RELEVANT SKILLS AND QUALIFICATIONS"));
    const qualLines = data.key_qualifications.split(/\n/).map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
    if (qualLines.length > 1) {
      for (const q of qualLines) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: q, size: 18, font: "Times New Roman" })] }));
      }
    } else {
      children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.key_qualifications, size: 20, font: "Times New Roman" })] }));
    }
  }

  // Section VI — Certifications
  if (data.certifications.length > 0) {
    children.push(unSectionHeader("VI. CERTIFICATIONS AND LICENCES"));
    for (const cert of data.certifications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: cert, size: 18, font: "Times New Roman" })] }));
    }
  }

  // Section VII — Publications
  if (data.publications.length > 0) {
    children.push(unSectionHeader("VII. PUBLISHED WORKS"));
    for (const pub of data.publications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: pub, size: 18, font: "Times New Roman" })] }));
    }
  }

  // Certification statement
  children.push(new Paragraph({ spacing: { before: 400 }, children: [] }));
  children.push(new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: UN_BLUE } },
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: "I certify that the statements made by me in answer to the foregoing questions are true, complete and correct to the best of my knowledge and belief.", italics: true, size: 16, font: "Times New Roman", color: "555555" })],
  }));
  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: [new TableRow({
      children: [
        new TableCell({ borders: UN_BORDERS_ALL, width: { size: 4500, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: "Date: _______________", size: 20, font: "Times New Roman" })] })] }),
        new TableCell({ borders: UN_BORDERS_ALL, width: { size: 4500, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: "Signature: _______________", size: 20, font: "Times New Roman" })] })] }),
      ],
    })],
  }));

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/* ═══════════════════════════════════════════════════════════
   GENERIC PROFESSIONAL TEMPLATE
   Clean, modern format suitable for NGOs, consulting firms
   ═══════════════════════════════════════════════════════════ */

const GP_DARK = "2D3436";
const GP_ACCENT = "0984E3";
const GP_LIGHT = "F0F3F5";
const GP_BORDER_S = { style: BorderStyle.SINGLE, size: 1, color: "DEE2E6" };
const GP_BORDERS = { top: GP_BORDER_S, bottom: GP_BORDER_S, left: GP_BORDER_S, right: GP_BORDER_S };
function gpSection(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GP_ACCENT } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: "Calibri", color: GP_ACCENT }),
    ],
  });
}

export async function generateGenericDocx(data: StructuredCvData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const p = data.personal;

  // Name header (large, clean)
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 40 },
    children: [new TextRun({ text: p.full_name.toUpperCase(), bold: true, size: 36, font: "Calibri", color: GP_DARK })],
  }));

  // Contact line
  const contactParts = [p.email, p.phone, p.address, p.country_of_residence].filter(Boolean);
  if (contactParts.length > 0) {
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: contactParts.join("  |  "), size: 18, font: "Calibri", color: "636E72" })],
    }));
  }
  if (p.nationality) {
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: `Nationality: ${p.nationality}`, size: 18, font: "Calibri", color: "636E72" })],
    }));
  }

  // Separator line
  children.push(new Paragraph({
    spacing: { after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: GP_ACCENT } },
    children: [],
  }));

  // Professional Summary
  if (data.professional_summary) {
    children.push(gpSection("Professional Summary"));
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: data.professional_summary, size: 20, font: "Calibri", color: GP_DARK })],
    }));
  }

  // Key Qualifications (shown early in generic format)
  if (data.key_qualifications) {
    children.push(gpSection("Core Competencies"));
    const qualLines = data.key_qualifications.split(/\n/).map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
    if (qualLines.length > 1) {
      for (const q of qualLines) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: q, size: 18, font: "Calibri" })] }));
      }
    } else {
      children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.key_qualifications, size: 20, font: "Calibri" })] }));
    }
  }

  // Experience
  if (data.employment.length > 0) {
    children.push(gpSection("Professional Experience"));
    for (const emp of data.employment) {
      // Position + Employer line
      children.push(new Paragraph({
        spacing: { before: 100, after: 20 },
        children: [
          new TextRun({ text: emp.position, bold: true, size: 22, font: "Calibri", color: GP_DARK }),
        ],
      }));
      children.push(new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: emp.employer, bold: true, size: 20, font: "Calibri", color: GP_ACCENT }),
          new TextRun({ text: `  |  ${emp.country}`, size: 18, font: "Calibri", color: "636E72" }),
        ],
      }));
      children.push(new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${emp.from_date} – ${emp.to_date}`, italics: true, size: 18, font: "Calibri", color: "636E72" }),
        ],
      }));

      // Description — parse as bullets if multiline
      if (emp.description_of_duties) {
        const dutyLines = emp.description_of_duties.split(/\n/).map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
        if (dutyLines.length > 1) {
          for (const d of dutyLines) {
            children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 15 }, children: [new TextRun({ text: d, size: 18, font: "Calibri" })] }));
          }
          children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
        } else {
          children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: emp.description_of_duties, size: 18, font: "Calibri" })] }));
        }
      }
    }
  }

  // Education
  if (data.education.length > 0) {
    children.push(gpSection("Education"));
    for (const edu of data.education) {
      children.push(new Paragraph({
        spacing: { before: 60, after: 10 },
        children: [
          new TextRun({ text: `${edu.degree} in ${edu.field_of_study}`, bold: true, size: 20, font: "Calibri", color: GP_DARK }),
        ],
      }));
      children.push(new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: edu.institution, size: 18, font: "Calibri", color: GP_ACCENT }),
          new TextRun({ text: `  |  ${edu.country}  |  ${edu.year_graduated}`, size: 18, font: "Calibri", color: "636E72" }),
        ],
      }));
    }
  }

  // Languages
  if (data.languages.length > 0) {
    children.push(gpSection("Languages"));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Language", "Reading", "Writing", "Speaking"].map(h =>
            new TableCell({
              borders: GP_BORDERS,
              shading: { fill: GP_LIGHT, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 18, font: "Calibri", color: GP_DARK })] })],
            })
          ),
        }),
        ...data.languages.map(l =>
          new TableRow({
            children: [
              new TableCell({ borders: GP_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: l.language, size: 18, font: "Calibri" })] })] }),
              new TableCell({ borders: GP_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.reading, size: 18, font: "Calibri" })] })] }),
              new TableCell({ borders: GP_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.writing, size: 18, font: "Calibri" })] })] }),
              new TableCell({ borders: GP_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.speaking, size: 18, font: "Calibri" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // Certifications
  if (data.certifications.length > 0) {
    children.push(gpSection("Certifications & Training"));
    for (const cert of data.certifications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: cert, size: 18, font: "Calibri" })] }));
    }
  }

  // Countries of Experience
  if (data.countries_of_experience.length > 0) {
    children.push(gpSection("International Experience"));
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: data.countries_of_experience.join("  •  "), size: 20, font: "Calibri" })],
    }));
  }

  // Professional Associations
  if (data.professional_associations.length > 0) {
    children.push(gpSection("Professional Memberships"));
    for (const a of data.professional_associations) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: a, size: 18, font: "Calibri" })] }));
    }
  }

  // Publications
  if (data.publications.length > 0) {
    children.push(gpSection("Publications"));
    for (const pub of data.publications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: pub, size: 18, font: "Calibri" })] }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/* ═══════════════════════════════════════════════════════════
   MODERN EXECUTIVE TEMPLATE
   Two-column: dark sidebar (contact/skills/languages) + main content
   Premium consulting firm aesthetic with photo placeholder
   ═══════════════════════════════════════════════════════════ */

const ME_DARK = "1A1A2E";
const ME_ACCENT = "E2B93B";   // warm gold
const ME_MID = "16213E";
const ME_LIGHT_BG = "F8F9FA";
const ME_TEXT_LIGHT = "FFFFFF";
const ME_TEXT_MUTED = "94A3B8";
const ME_TEXT_DARK = "1E293B";
const ME_FONT = "Calibri";
const ME_NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const ME_NO_BORDERS = { top: ME_NO_BORDER, bottom: ME_NO_BORDER, left: ME_NO_BORDER, right: ME_NO_BORDER };

function meSidebarLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text: "\u2501\u2501 ", size: 14, font: ME_FONT, color: ME_ACCENT }),
      new TextRun({ text: text.toUpperCase(), bold: true, size: 16, font: ME_FONT, color: ME_ACCENT }),
    ],
  });
}

function meSidebarItem(icon: string, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${icon}  `, size: 16, font: ME_FONT, color: ME_ACCENT }),
      new TextRun({ text, size: 16, font: ME_FONT, color: ME_TEXT_LIGHT }),
    ],
  });
}

function meMainSection(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: ME_ACCENT } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: ME_FONT, color: ME_DARK }),
    ],
  });
}

/** Generate a simple photo placeholder as PNG buffer — circle with initials */
function generatePhotoPlaceholder(initials: string): Buffer {
  // Create a minimal 1x1 pixel PNG (the docx library needs valid image data)
  // We'll use a styled text placeholder instead since generating actual PNGs requires canvas
  // Return a tiny transparent PNG as the image data
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  return tinyPng;
}

export async function generateModernExecDocx(data: StructuredCvData): Promise<Buffer> {
  const p = data.personal;
  const initials = p.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  /* ── SIDEBAR CONTENT ────────────────────────────── */
  const sidebarChildren: Paragraph[] = [];

  // Photo placeholder area — initials circle
  sidebarChildren.push(new Paragraph({ spacing: { before: 100, after: 20 }, alignment: AlignmentType.CENTER, children: [] }));
  sidebarChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [new TextRun({ text: "┌─────────┐", size: 16, font: ME_FONT, color: ME_ACCENT })],
  }));
  sidebarChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({ text: "│   ", size: 16, font: ME_FONT, color: ME_ACCENT }),
      new TextRun({ text: initials, bold: true, size: 40, font: ME_FONT, color: ME_ACCENT }),
      new TextRun({ text: "   │", size: 16, font: ME_FONT, color: ME_ACCENT }),
    ],
  }));
  sidebarChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "└─────────┘", size: 16, font: ME_FONT, color: ME_ACCENT })],
  }));
  sidebarChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: "PHOTO", size: 14, font: ME_FONT, color: ME_TEXT_MUTED })],
  }));

  // Contact
  sidebarChildren.push(meSidebarLabel("Contact"));
  if (p.email) sidebarChildren.push(meSidebarItem("✉", p.email));
  if (p.phone) sidebarChildren.push(meSidebarItem("☎", p.phone));
  if (p.address) sidebarChildren.push(meSidebarItem("⌂", p.address));
  if (p.country_of_residence && p.country_of_residence !== p.address) {
    sidebarChildren.push(meSidebarItem("◎", p.country_of_residence));
  }
  if (p.nationality) sidebarChildren.push(meSidebarItem("⚑", p.nationality));
  if (p.date_of_birth) sidebarChildren.push(meSidebarItem("◆", p.date_of_birth));

  // Languages
  if (data.languages.length > 0) {
    sidebarChildren.push(meSidebarLabel("Languages"));
    for (const l of data.languages) {
      sidebarChildren.push(new Paragraph({
        spacing: { after: 30 },
        children: [
          new TextRun({ text: l.language, bold: true, size: 16, font: ME_FONT, color: ME_TEXT_LIGHT }),
          new TextRun({ text: `  ${l.speaking}`, size: 14, font: ME_FONT, color: ME_TEXT_MUTED }),
        ],
      }));
    }
  }

  // Key skills (compact)
  if (data.key_qualifications) {
    sidebarChildren.push(meSidebarLabel("Expertise"));
    const skills = data.key_qualifications.split(/[,\n•\-]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 60).slice(0, 8);
    for (const skill of skills) {
      sidebarChildren.push(new Paragraph({
        spacing: { after: 25 },
        children: [
          new TextRun({ text: "▪ ", size: 14, font: ME_FONT, color: ME_ACCENT }),
          new TextRun({ text: skill, size: 14, font: ME_FONT, color: ME_TEXT_LIGHT }),
        ],
      }));
    }
  }

  // Countries
  if (data.countries_of_experience.length > 0) {
    sidebarChildren.push(meSidebarLabel("Countries"));
    sidebarChildren.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: data.countries_of_experience.join(", "), size: 14, font: ME_FONT, color: ME_TEXT_LIGHT })],
    }));
  }

  // Certifications
  if (data.certifications.length > 0) {
    sidebarChildren.push(meSidebarLabel("Certifications"));
    for (const cert of data.certifications.slice(0, 5)) {
      sidebarChildren.push(new Paragraph({
        spacing: { after: 25 },
        children: [
          new TextRun({ text: "▪ ", size: 14, font: ME_FONT, color: ME_ACCENT }),
          new TextRun({ text: cert, size: 13, font: ME_FONT, color: ME_TEXT_LIGHT }),
        ],
      }));
    }
  }

  // Associations
  if (data.professional_associations.length > 0) {
    sidebarChildren.push(meSidebarLabel("Affiliations"));
    for (const a of data.professional_associations.slice(0, 4)) {
      sidebarChildren.push(new Paragraph({
        spacing: { after: 25 },
        children: [new TextRun({ text: `▪ ${a}`, size: 13, font: ME_FONT, color: ME_TEXT_LIGHT })],
      }));
    }
  }

  /* ── MAIN CONTENT ───────────────────────────────── */
  const mainChildren: (Paragraph | Table)[] = [];

  // Name header
  mainChildren.push(new Paragraph({
    spacing: { before: 100, after: 0 },
    children: [new TextRun({ text: p.full_name.toUpperCase(), bold: true, size: 36, font: ME_FONT, color: ME_DARK })],
  }));

  // Gold accent line
  mainChildren.push(new Paragraph({
    spacing: { before: 40, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ME_ACCENT } },
    children: [],
  }));

  // Professional Summary
  if (data.professional_summary) {
    mainChildren.push(meMainSection("Profile"));
    mainChildren.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: data.professional_summary, size: 19, font: ME_FONT, color: "475569" })],
    }));
  }

  // Experience
  if (data.employment.length > 0) {
    mainChildren.push(meMainSection("Experience"));
    for (const emp of data.employment) {
      // Position title
      mainChildren.push(new Paragraph({
        spacing: { before: 120, after: 10 },
        children: [new TextRun({ text: emp.position, bold: true, size: 21, font: ME_FONT, color: ME_DARK })],
      }));
      // Employer + dates
      mainChildren.push(new Paragraph({
        spacing: { after: 10 },
        children: [
          new TextRun({ text: emp.employer, bold: true, size: 18, font: ME_FONT, color: ME_ACCENT.replace("E2B93B", "B8860B") }),
          new TextRun({ text: `  │  ${emp.country || ""}  │  ${emp.from_date} – ${emp.to_date}`, size: 16, font: ME_FONT, color: ME_TEXT_MUTED }),
        ],
      }));
      // Duties
      if (emp.description_of_duties) {
        const lines = emp.description_of_duties.split(/\n/).map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
        if (lines.length > 1) {
          for (const d of lines) {
            mainChildren.push(new Paragraph({
              spacing: { after: 15 },
              indent: { left: 200 },
              children: [
                new TextRun({ text: "▸ ", size: 16, font: ME_FONT, color: ME_ACCENT }),
                new TextRun({ text: d, size: 17, font: ME_FONT, color: "475569" }),
              ],
            }));
          }
        } else {
          mainChildren.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: emp.description_of_duties, size: 17, font: ME_FONT, color: "475569" })],
          }));
        }
      }
      mainChildren.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    }
  }

  // Education
  if (data.education.length > 0) {
    mainChildren.push(meMainSection("Education"));
    for (const edu of data.education) {
      mainChildren.push(new Paragraph({
        spacing: { before: 60, after: 10 },
        children: [
          new TextRun({ text: `${edu.degree} in ${edu.field_of_study}`, bold: true, size: 20, font: ME_FONT, color: ME_DARK }),
        ],
      }));
      mainChildren.push(new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: edu.institution, size: 18, font: ME_FONT, color: "B8860B" }),
          new TextRun({ text: `  │  ${edu.country}  │  ${edu.year_graduated}`, size: 16, font: ME_FONT, color: ME_TEXT_MUTED }),
        ],
      }));
    }
  }

  // Publications
  if (data.publications.length > 0) {
    mainChildren.push(meMainSection("Publications"));
    for (const pub of data.publications) {
      mainChildren.push(new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: "▸ ", size: 16, font: ME_FONT, color: ME_ACCENT }),
          new TextRun({ text: pub, size: 17, font: ME_FONT, color: "475569" }),
        ],
      }));
    }
  }

  /* ── BUILD TWO-COLUMN LAYOUT ─────────────────────── */
  const mainTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 10400, type: WidthType.DXA },
    rows: [new TableRow({
      children: [
        // SIDEBAR (dark background)
        new TableCell({
          borders: ME_NO_BORDERS,
          width: { size: 3200, type: WidthType.DXA },
          shading: { fill: ME_DARK, type: ShadingType.CLEAR, color: "auto" },
          children: sidebarChildren,
        }),
        // MAIN CONTENT (white)
        new TableCell({
          borders: ME_NO_BORDERS,
          width: { size: 7200, type: WidthType.DXA },
          children: mainChildren,
        }),
      ],
    })],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 400, bottom: 400, left: 400, right: 400 },
        },
      },
      children: [mainTable],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE DISPATCHER — routes template ID to generator
   ═══════════════════════════════════════════════════════════ */

export async function generateCvDocx(
  data: StructuredCvData,
  template: CvTemplate = "wb-standard"
): Promise<{ buffer: Buffer; filename: string }> {
  const safeName = data.personal.full_name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40);

  const TEMPLATE_LABELS: Record<CvTemplate, string> = {
    "wb-standard": "WB_Standard",
    "europass": "Europass",
    "au-standard": "AU_Standard",
    "un-php": "UN_PHP",
    "generic-professional": "Professional",
    "modern-executive": "Executive",
  };

  let buffer: Buffer;
  switch (template) {
    case "europass":
      buffer = await generateEuropassDocx(data);
      break;
    case "au-standard":
      buffer = await generateAuDocx(data);
      break;
    case "un-php":
      buffer = await generateUnPhpDocx(data);
      break;
    case "generic-professional":
      buffer = await generateGenericDocx(data);
      break;
    case "modern-executive":
      buffer = await generateModernExecDocx(data);
      break;
    case "wb-standard":
    default:
      buffer = await generateWbCvDocx(data);
      break;
  }

  return {
    buffer,
    filename: `CV_${safeName}_${TEMPLATE_LABELS[template] || "CV"}.docx`,
  };
}

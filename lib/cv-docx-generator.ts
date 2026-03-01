import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  TableLayoutType,
  ShadingType,
} from "docx";
import type { StructuredCvData, CvTemplate } from "./types/cv-data";

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
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Description of Duties: ",
                          bold: true,
                          size: 20,
                          font: FONT,
                        }),
                        new TextRun({
                          text: emp.description_of_duties,
                          size: 20,
                          font: FONT,
                        }),
                      ],
                    }),
                  ],
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
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: data.key_qualifications,
            size: 20,
            font: FONT,
          }),
        ],
      })
    );
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
   EUROPASS TEMPLATE — EU Standard CV Format
   Blue theme (#003399), CEFR language grid, competence sections
   ═══════════════════════════════════════════════════════════ */

const EU_BLUE = "003399";
const EU_LIGHT = "E8EEF7";
const EU_BORDER = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const EU_BORDERS = { top: EU_BORDER, bottom: EU_BORDER, left: EU_BORDER, right: EU_BORDER };

function euHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: EU_BLUE } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 24, font: "Arial", color: EU_BLUE }),
    ],
  });
}

function euLabelValue(label: string, value: string): Table {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: EU_BORDER, bottom: EU_BORDER, left: EU_BORDER, right: EU_BORDER },
            width: { size: 2800, type: WidthType.DXA },
            shading: { fill: EU_LIGHT, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Arial", color: EU_BLUE })] })],
          }),
          new TableCell({
            borders: { top: EU_BORDER, bottom: EU_BORDER, left: EU_BORDER, right: EU_BORDER },
            width: { size: 6200, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: "Arial" })] })],
          }),
        ],
      }),
    ],
  });
}

export async function generateEuropassDocx(data: StructuredCvData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const p = data.personal;

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 60 },
    children: [new TextRun({ text: "Europass", bold: true, size: 36, font: "Arial", color: EU_BLUE })],
  }));
  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: "Curriculum Vitae", italics: true, size: 28, font: "Arial", color: "666666" })],
  }));

  // Personal Information
  children.push(euHeading("Personal Information"));
  const personalFields = [
    ["Full Name", p.full_name],
    ["Nationality", p.nationality],
    ["Date of Birth", p.date_of_birth],
    ["Email", p.email],
    ["Phone", p.phone],
    ["Address", p.address],
  ].filter(([, v]) => v);

  for (const [label, value] of personalFields) {
    children.push(euLabelValue(label, value));
  }

  // Professional Summary
  if (data.professional_summary) {
    children.push(euHeading("Professional Profile"));
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: data.professional_summary, size: 20, font: "Arial" })],
    }));
  }

  // Work Experience (reverse chronological)
  if (data.employment.length > 0) {
    children.push(euHeading("Work Experience"));
    for (const emp of data.employment) {
      children.push(new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 2800, type: WidthType.DXA },
                shading: { fill: EU_LIGHT, type: ShadingType.CLEAR, color: "auto" },
                children: [
                  new Paragraph({ children: [new TextRun({ text: `${emp.from_date} – ${emp.to_date}`, bold: true, size: 20, font: "Arial", color: EU_BLUE })] }),
                ],
              }),
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 6200, type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: emp.position, bold: true, size: 20, font: "Arial" })] }),
                  new Paragraph({ children: [new TextRun({ text: `${emp.employer}${emp.country ? `, ${emp.country}` : ""}`, italics: true, size: 20, font: "Arial", color: "555555" })] }),
                  new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: emp.description_of_duties, size: 18, font: "Arial" })] }),
                ],
              }),
            ],
          }),
        ],
      }));
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    }
  }

  // Education and Training
  if (data.education.length > 0) {
    children.push(euHeading("Education and Training"));
    for (const edu of data.education) {
      children.push(new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 2800, type: WidthType.DXA },
                shading: { fill: EU_LIGHT, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: String(edu.year_graduated), bold: true, size: 20, font: "Arial", color: EU_BLUE })] })],
              }),
              new TableCell({
                borders: EU_BORDERS,
                width: { size: 6200, type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: `${edu.degree} — ${edu.field_of_study}`, bold: true, size: 20, font: "Arial" })] }),
                  new Paragraph({ children: [new TextRun({ text: `${edu.institution}${edu.country ? `, ${edu.country}` : ""}`, italics: true, size: 20, font: "Arial", color: "555555" })] }),
                ],
              }),
            ],
          }),
        ],
      }));
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    }
  }

  // Languages (Europass self-assessment grid)
  if (data.languages.length > 0) {
    children.push(euHeading("Language Skills"));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Language", "Understanding", "Speaking", "Writing"].map(h =>
            new TableCell({
              borders: EU_BORDERS,
              shading: { fill: EU_BLUE, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })],
            })
          ),
        }),
        ...data.languages.map(l =>
          new TableRow({
            children: [
              new TableCell({ borders: EU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: l.language, bold: true, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.reading, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.speaking, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: EU_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.writing, size: 18, font: "Arial" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // Key Qualifications & Skills
  if (data.key_qualifications) {
    children.push(euHeading("Personal Skills and Competences"));
    children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.key_qualifications, size: 20, font: "Arial" })] }));
  }

  // Certifications
  if (data.certifications.length > 0) {
    children.push(euHeading("Additional Information"));
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Certifications & Training", bold: true, size: 20, font: "Arial" })] }));
    for (const cert of data.certifications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: cert, size: 18, font: "Arial" })] }));
    }
  }

  // Publications
  if (data.publications.length > 0) {
    if (data.certifications.length === 0) children.push(euHeading("Additional Information"));
    children.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [new TextRun({ text: "Publications", bold: true, size: 20, font: "Arial" })] }));
    for (const pub of data.publications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: pub, size: 18, font: "Arial" })] }));
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
   AFRICAN UNION TEMPLATE — AU Standard Format
   Gold/green theme, nationality emphasis, AU competency framework
   ═══════════════════════════════════════════════════════════ */

const AU_GREEN = "009639";
const AU_GOLD = "C09A36";
const AU_LIGHT_GREEN = "E8F5E9";
const AU_BORDER_STYLE = { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" };
const AU_BORDERS = { top: AU_BORDER_STYLE, bottom: AU_BORDER_STYLE, left: AU_BORDER_STYLE, right: AU_BORDER_STYLE };

function auHeading(num: string, text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    shading: { fill: AU_LIGHT_GREEN, type: ShadingType.CLEAR, color: "auto" },
    children: [
      new TextRun({ text: `${num}. `, bold: true, size: 24, font: "Arial", color: AU_GOLD }),
      new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: "Arial", color: AU_GREEN }),
    ],
  });
}

export async function generateAuDocx(data: StructuredCvData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const p = data.personal;

  // Title block
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: "AFRICAN UNION", bold: true, size: 28, font: "Arial", color: AU_GREEN })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "CURRICULUM VITAE", bold: true, size: 24, font: "Arial", color: AU_GOLD })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: AU_GREEN } },
    children: [new TextRun({ text: `Position Applied For: ___________________________`, size: 20, font: "Arial", color: "555555" })],
  }));

  // Personal Data (AU emphasizes nationality, gender, marital status)
  children.push(auHeading("1", "Personal Data"));
  const auPersonalRows = [
    ["Surname", p.full_name.split(" ").slice(-1).join("")],
    ["First Name(s)", p.full_name.split(" ").slice(0, -1).join(" ")],
    ["Nationality", p.nationality],
    ["Date of Birth", p.date_of_birth],
    ["Country of Residence", p.country_of_residence],
    ["Postal Address", p.address],
    ["Telephone", p.phone],
    ["Email Address", p.email],
  ].filter(([, v]) => v);

  children.push(new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: auPersonalRows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: AU_BORDERS, width: { size: 3200, type: WidthType.DXA },
            shading: { fill: AU_LIGHT_GREEN, type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Arial", color: AU_GREEN })] })],
          }),
          new TableCell({
            borders: AU_BORDERS, width: { size: 5800, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: "Arial" })] })],
          }),
        ],
      })
    ),
  }));

  // Professional Summary
  if (data.professional_summary) {
    children.push(auHeading("2", "Professional Summary"));
    children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.professional_summary, size: 20, font: "Arial" })] }));
  }

  // Education
  if (data.education.length > 0) {
    children.push(auHeading("3", "Education / Academic Qualifications"));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Institution", "Degree / Diploma", "Field of Study", "Country", "Year"].map(h =>
            new TableCell({
              borders: AU_BORDERS,
              shading: { fill: AU_GREEN, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })],
            })
          ),
        }),
        ...data.education.map(e =>
          new TableRow({
            children: [
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: e.institution, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: e.degree, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: e.field_of_study, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: e.country, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: String(e.year_graduated), size: 18, font: "Arial" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // Professional Experience
  if (data.employment.length > 0) {
    children.push(auHeading("4", "Professional Experience"));
    for (const emp of data.employment) {
      children.push(new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: AU_BORDERS, width: { size: 2200, type: WidthType.DXA },
                shading: { fill: AU_LIGHT_GREEN, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "Period", bold: true, size: 18, font: "Arial", color: AU_GREEN })] })],
              }),
              new TableCell({ borders: AU_BORDERS, width: { size: 2500, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: `${emp.from_date} – ${emp.to_date}`, size: 18, font: "Arial" })] })] }),
              new TableCell({
                borders: AU_BORDERS, width: { size: 1600, type: WidthType.DXA },
                shading: { fill: AU_LIGHT_GREEN, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "Country", bold: true, size: 18, font: "Arial", color: AU_GREEN })] })],
              }),
              new TableCell({ borders: AU_BORDERS, width: { size: 2700, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: emp.country, size: 18, font: "Arial" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: AU_BORDERS,
                shading: { fill: AU_LIGHT_GREEN, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "Organization", bold: true, size: 18, font: "Arial", color: AU_GREEN })] })],
              }),
              new TableCell({ borders: AU_BORDERS, columnSpan: 3,
                children: [new Paragraph({ children: [new TextRun({ text: emp.employer, size: 18, font: "Arial" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: AU_BORDERS,
                shading: { fill: AU_LIGHT_GREEN, type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: "Position Title", bold: true, size: 18, font: "Arial", color: AU_GREEN })] })],
              }),
              new TableCell({ borders: AU_BORDERS, columnSpan: 3,
                children: [new Paragraph({ children: [new TextRun({ text: emp.position, bold: true, size: 18, font: "Arial" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: AU_BORDERS, columnSpan: 4,
                children: [
                  new Paragraph({ children: [new TextRun({ text: "Key Responsibilities:", bold: true, size: 18, font: "Arial", color: AU_GREEN })] }),
                  new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: emp.description_of_duties, size: 18, font: "Arial" })] }),
                ],
              }),
            ],
          }),
        ],
      }));
      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    }
  }

  // Language Proficiency
  if (data.languages.length > 0) {
    children.push(auHeading("5", "Language Proficiency"));
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "AU Working Languages: Arabic, English, French, Kiswahili, Portuguese, Spanish", italics: true, size: 16, font: "Arial", color: "777777" })],
    }));
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: ["Language", "Reading", "Writing", "Speaking"].map(h =>
            new TableCell({
              borders: AU_BORDERS,
              shading: { fill: AU_GREEN, type: ShadingType.CLEAR, color: "auto" },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })],
            })
          ),
        }),
        ...data.languages.map(l =>
          new TableRow({
            children: [
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: l.language, bold: true, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.reading, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.writing, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: AU_BORDERS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.speaking, size: 18, font: "Arial" })] })] }),
            ],
          })
        ),
      ],
    }));
  }

  // Key Competencies
  if (data.key_qualifications) {
    children.push(auHeading("6", "Key Competencies"));
    children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.key_qualifications, size: 20, font: "Arial" })] }));
  }

  // Certifications
  if (data.certifications.length > 0) {
    children.push(auHeading("7", "Certifications & Training"));
    for (const cert of data.certifications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: cert, size: 18, font: "Arial" })] }));
    }
  }

  // Countries of Experience
  if (data.countries_of_experience.length > 0) {
    children.push(auHeading("8", "Countries of Work Experience"));
    children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.countries_of_experience.join(", "), size: 20, font: "Arial" })] }));
  }

  // Publications
  if (data.publications.length > 0) {
    children.push(auHeading("9", "Publications"));
    for (const pub of data.publications) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: pub, size: 18, font: "Arial" })] }));
    }
  }

  // Professional Associations
  if (data.professional_associations.length > 0) {
    children.push(auHeading("10", "Professional Associations / Memberships"));
    for (const a of data.professional_associations) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: a, size: 18, font: "Arial" })] }));
    }
  }

  // Declaration
  children.push(new Paragraph({ spacing: { before: 400 }, children: [] }));
  children.push(new Paragraph({
    spacing: { after: 200 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: AU_GREEN } },
    children: [new TextRun({ text: "I certify that the information provided above is true and correct to the best of my knowledge.", italics: true, size: 18, font: "Arial", color: "555555" })],
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: "Date: _________________    Signature: _________________", size: 20, font: "Arial" }),
    ],
  }));

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } },
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
  const surname = nameParts.length > 1 ? nameParts.slice(-1).join("") : p.full_name;
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
                children: [
                  new Paragraph({ children: [new TextRun({ text: "MAIN DUTIES AND RESPONSIBILITIES:", bold: true, size: 16, font: "Times New Roman", color: UN_BLUE })] }),
                  new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: emp.description_of_duties, size: 18, font: "Times New Roman" })] }),
                ],
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
    children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: data.key_qualifications, size: 20, font: "Times New Roman" })] }));
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
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: data.key_qualifications, size: 20, font: "Calibri" })],
    }));
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

      // Description
      if (emp.description_of_duties) {
        children.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: emp.description_of_duties, size: 18, font: "Calibri" })],
        }));
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

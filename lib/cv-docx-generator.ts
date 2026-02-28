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
} from "docx";
import type { StructuredCvData } from "./types/cv-data";

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

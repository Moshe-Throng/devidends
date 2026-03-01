export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Polyfill DOMMatrix for pdfjs-dist in Node.js (Vercel serverless)
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class DOMMatrix {
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      is2D = true; isIdentity = true;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          this.m11 = this.a; this.m12 = this.b;
          this.m21 = this.c; this.m22 = this.d;
          this.m41 = this.e; this.m42 = this.f;
        }
      }
    } as unknown as typeof DOMMatrix;
  }

  // pdf-parse v2 uses a class-based API
  const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> } };
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  // Use require() for reliable CJS loading on Vercel serverless (matches pdf-parse pattern)
  const mammoth = require("mammoth") as typeof import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export function detectFileType(
  filename: string
): "pdf" | "docx" | "doc" | "txt" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";
  if (ext === "txt" || ext === "rtf") return "txt";
  return "unknown";
}

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const type = detectFileType(filename);
  if (type === "pdf") return extractTextFromPdf(buffer);
  if (type === "docx") return extractTextFromDocx(buffer);
  if (type === "doc") return extractTextFromDocx(buffer); // mammoth handles .doc too
  if (type === "txt") return buffer.toString("utf-8");
  throw new Error(
    `Unsupported file type: ${filename}. Supported: PDF, DOCX, DOC, TXT.`
  );
}

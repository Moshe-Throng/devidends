export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v1 — simple function API, no worker files needed (Vercel-safe)
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
  const data = await pdfParse(buffer);
  return data.text;
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

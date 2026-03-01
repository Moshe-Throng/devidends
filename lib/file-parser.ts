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

export async function extractTextFromDoc(buffer: Buffer): Promise<string> {
  // word-extractor handles binary .doc (Word 97-2003) format
  const WordExtractor = require("word-extractor");
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return doc.getBody();
}

export function detectFileType(
  filename: string,
  mimeType?: string
): "pdf" | "docx" | "doc" | "txt" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";
  if (ext === "txt" || ext === "rtf") return "txt";

  // Fallback to MIME type (mobile browsers may send files without proper extensions)
  if (mimeType) {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
    if (mimeType === "application/msword") return "doc";
    if (mimeType === "application/x-cfb") return "doc"; // some mobile browsers
    if (mimeType.startsWith("text/")) return "txt";
  }

  return "unknown";
}

export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string> {
  const type = detectFileType(filename, mimeType);
  if (type === "pdf") return extractTextFromPdf(buffer);
  if (type === "docx") return extractTextFromDocx(buffer);
  if (type === "doc") return extractTextFromDoc(buffer);
  if (type === "txt") return buffer.toString("utf-8");
  throw new Error(
    `Unsupported file type: ${filename}. Supported: PDF, DOCX, DOC, TXT.`
  );
}

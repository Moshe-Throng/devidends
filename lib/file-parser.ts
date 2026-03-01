export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 uses a class-based API
  const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> } };
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateCvDocx } from "@/lib/cv-docx-generator";
import type { StructuredCvData, CvTemplate } from "@/lib/types/cv-data";

const BUCKET = "cv-downloads";
const SIGNED_URL_TTL = 3600; // 1 hour

/**
 * POST /api/cv/generate-download-url
 *
 * Generates a DOCX, uploads it to Supabase Storage, and returns a signed URL.
 * Used by the Telegram mini app where blob URL / anchor click downloads don't work.
 * The signed URL can be used with Telegram.WebApp.downloadFile({ url, file_name }).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cvData = body.cv_data as StructuredCvData | undefined;
    const template = (body.template as CvTemplate) || "wb-standard";

    if (!cvData?.personal?.full_name) {
      return NextResponse.json({ error: "Missing cv_data with full_name" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate DOCX
    const { buffer, filename } = await generateCvDocx(cvData, template);

    // Ensure bucket exists (ignore error if already exists)
    await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024, // 10 MB
    });

    // Upload with a unique path so concurrent users don't collide
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.docx`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[generate-download-url] upload error:", uploadErr.message);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // Create signed URL valid for 1 hour
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL, {
        download: filename, // tells browser to download with this filename
      });

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({ error: "Failed to create download URL" }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl, filename });
  } catch (err) {
    console.error("[generate-download-url]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

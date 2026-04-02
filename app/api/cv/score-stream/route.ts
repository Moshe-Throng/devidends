import { NextRequest } from "next/server";
import { scoreCv } from "@/lib/cv-scorer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MIN_TEXT_LENGTH = 100;
const RATE_LIMIT = 5;
const RATE_WINDOW = 24 * 60 * 60 * 1000;

/**
 * Streaming CV score endpoint — sends SSE events to keep connection alive.
 * Events: progress (step updates), score (final result), error.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const sse = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ip = getClientIp(req.headers);
        const rl = checkRateLimit(`cv-score:${ip}`, RATE_LIMIT, RATE_WINDOW);
        if (!rl.allowed) {
          controller.enqueue(sse("error", { error: "Daily limit reached (5 scores). Try again tomorrow." }));
          controller.close();
          return;
        }

        const body = await req.json();
        const cvText: string = body.cv_text || "";

        if (cvText.trim().length < MIN_TEXT_LENGTH) {
          controller.enqueue(sse("error", { error: `CV text too short (${cvText.trim().length} chars)` }));
          controller.close();
          return;
        }

        // Send progress updates while scoring runs
        controller.enqueue(sse("progress", { step: "Analyzing your CV..." }));

        const steps = [
          { delay: 3000, msg: "Reading your experience..." },
          { delay: 6000, msg: "Evaluating structure..." },
          { delay: 10000, msg: "Checking donor readiness..." },
          { delay: 18000, msg: "Scoring dimensions..." },
          { delay: 28000, msg: "Generating suggestions..." },
        ];

        // Fire progress updates on timers (non-blocking)
        const timers = steps.map(({ delay, msg }) =>
          setTimeout(() => {
            try { controller.enqueue(sse("progress", { step: msg })); } catch {}
          }, delay)
        );

        // Run the actual scorer (blocks until complete)
        const result = await scoreCv(cvText, body.opportunity);

        // Clear timers
        timers.forEach(clearTimeout);

        controller.enqueue(sse("progress", { step: "Finalizing..." }));
        controller.enqueue(sse("score", { ...result, scores_remaining: rl.remaining }));
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Scoring failed";
        console.error("[cv-score-stream]", msg);
        try {
          controller.enqueue(sse("error", { error: msg }));
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

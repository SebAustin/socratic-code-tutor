import { z } from "zod";
import { buildTutorMessages } from "@/features/tutor/promptBuilder";
import { screenForClient } from "@/features/tutor/guardrail";
import { encodeSse, hasCompleteScreenBoundary } from "@/lib/sse";
import {
  MAX_CHAT_TURN_LEN,
  MAX_CODE_LEN,
  MAX_OUTPUT_TOKENS,
  MAX_RUN_OUTPUT_LEN,
  MAX_RUN_STATUS_LEN,
  MAX_SESSION_ID_LEN,
  MAX_TRACE_SUMMARY_LEN,
  MAX_TURNS_PER_SESSION,
} from "@/lib/constants";
import { checkRateLimit } from "@/server/ratelimit";
import { rateLimitKey } from "@/server/ratelimit";
import { createOpenAI } from "@/server/openai";

export const runtime = "nodejs";

const RequestSchema = z.object({
  sessionId: z.string().min(1).max(MAX_SESSION_ID_LEN),
  code: z.string().max(MAX_CODE_LEN),
  run: z.object({
    stdout: z.string().max(MAX_RUN_OUTPUT_LEN),
    stderr: z.string().max(MAX_RUN_OUTPUT_LEN),
    error: z
      .object({ excType: z.string(), message: z.string(), line: z.number().nullable() })
      .nullable(),
    status: z.string().max(MAX_RUN_STATUS_LEN),
  }),
  traceSummary: z.string().max(MAX_TRACE_SUMMARY_LEN),
  history: z.array(
    z.object({
      role: z.enum(["student", "tutor"]),
      content: z.string().max(MAX_CHAT_TURN_LEN),
      rung: z.number().optional(),
    }),
  ),
  requestedRung: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  lang: z.enum(["python", "javascript"]),
});

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(rateLimitKey(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "Tutor rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid tutor request." }, { status: 400 });
  const body = parsed.data;
  if (body.history.filter(({ role }) => role === "student").length > MAX_TURNS_PER_SESSION) {
    return Response.json({ error: "Session turn limit reached." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "Tutor is not configured." }, { status: 503 });
  const model = process.env.OPENAI_MODEL ?? "gpt-5.6";
  const openai = createOpenAI(apiKey);
  const messages = buildTutorMessages(body);
  const upstreamController = new AbortController();
  let abortModelStream = () => {};
  const onRequestAbort = () => {
    if (!upstreamController.signal.aborted) upstreamController.abort(request.signal.reason);
    abortModelStream();
  };
  request.signal.addEventListener("abort", onRequestAbort, { once: true });

  try {
    const modelStream = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }, { signal: upstreamController.signal });
    abortModelStream = () => modelStream.controller.abort();
    if (request.signal.aborted) onRequestAbort();

    let closed = false;
    const abortUpstream = (reason?: unknown) => {
      if (!upstreamController.signal.aborted) upstreamController.abort(reason);
      abortModelStream();
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulated = "";
        let releasedLength = 0;
        let flagged = false;

        const enqueue = (event: Parameters<typeof encodeSse>[0]) => {
          if (closed || upstreamController.signal.aborted && !flagged) return false;
          try {
            controller.enqueue(encodeSse(event));
            return true;
          } catch {
            closed = true;
            abortUpstream("downstream-closed");
            return false;
          }
        };

        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // The consumer may already have canceled the response body.
          }
        };

        const release = (final = false) => {
          const pending = accumulated.slice(releasedLength);
          if (!pending || (!final && !hasCompleteScreenBoundary(pending))) return true;
          const result = screenForClient(accumulated, body.code, body.requestedRung);
          if (!result.flagged) {
            enqueue({ chunk: pending });
            releasedLength = accumulated.length;
            return true;
          }

          flagged = true;
          abortUpstream("guardrail-flagged");
          console.warn("[tutor-guardrail] screened model output", {
            sessionId: body.sessionId,
            reason: result.reason,
          });
          enqueue({ chunk: result.chunk });
          enqueue({ done: true, rung: body.requestedRung, flagged: true });
          close();
          return false;
        };

        try {
          for await (const chunk of modelStream) {
            accumulated += chunk.choices[0]?.delta?.content ?? "";
            if (!release(false)) return;
          }
          if (!release(true)) return;
          enqueue({ done: true, rung: body.requestedRung, flagged });
          close();
        } catch {
          if (!upstreamController.signal.aborted) {
            enqueue({ error: "Tutor stream interrupted." });
          }
          close();
        } finally {
          request.signal.removeEventListener("abort", onRequestAbort);
        }
      },
      cancel(reason) {
        closed = true;
        request.signal.removeEventListener("abort", onRequestAbort);
        abortUpstream(reason);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    request.signal.removeEventListener("abort", onRequestAbort);
    return Response.json({ error: "Tutor unavailable. Please retry." }, { status: 502 });
  }
}

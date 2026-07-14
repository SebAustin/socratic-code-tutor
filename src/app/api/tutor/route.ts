import { z } from "zod";
import { buildTutorMessages } from "@/features/tutor/promptBuilder";
import { screenForClient } from "@/features/tutor/guardrail";
import { encodeSse, hasCompleteScreenBoundary } from "@/lib/sse";
import {
  MAX_CODE_LEN,
  MAX_OUTPUT_TOKENS,
  MAX_TURNS_PER_SESSION,
} from "@/lib/constants";
import { checkRateLimit } from "@/server/ratelimit";
import { createOpenAI } from "@/server/openai";
import type { TutorRequest } from "@/features/session/types";

export const runtime = "nodejs";

const RequestSchema = z.object({
  sessionId: z.string().min(1).max(120),
  code: z.string().max(MAX_CODE_LEN),
  run: z.object({
    stdout: z.string().max(20_000),
    stderr: z.string().max(20_000),
    error: z
      .object({ excType: z.string(), message: z.string(), line: z.number().nullable() })
      .nullable(),
    status: z.string().max(40),
  }),
  traceSummary: z.string().max(8_000),
  history: z.array(
    z.object({
      role: z.enum(["student", "tutor"]),
      content: z.string().max(6_000),
      rung: z.number().optional(),
    }),
  ),
  requestedRung: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  lang: z.enum(["python", "javascript"]),
});

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientIp(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "Tutor rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid tutor request." }, { status: 400 });
  const body = parsed.data as TutorRequest;
  if (body.history.filter(({ role }) => role === "student").length > MAX_TURNS_PER_SESSION) {
    return Response.json({ error: "Session turn limit reached." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "Tutor is not configured." }, { status: 503 });
  const model = process.env.OPENAI_MODEL ?? "gpt-5.6";
  const openai = createOpenAI(apiKey);
  const messages = buildTutorMessages(body);

  try {
    const modelStream = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let pending = "";
        let flagged = false;

        const release = (final = false) => {
          if (!pending || (!final && !hasCompleteScreenBoundary(pending))) return;
          const result = screenForClient(pending, body.code, body.requestedRung);
          if (!result.flagged) controller.enqueue(encodeSse({ chunk: result.chunk }));
          else {
            flagged = true;
            console.warn("[tutor-guardrail] screened model output", {
              sessionId: body.sessionId,
              reason: result.reason,
            });
            controller.enqueue(encodeSse({ chunk: result.chunk }));
          }
          pending = "";
        };

        try {
          for await (const chunk of modelStream) {
            pending += chunk.choices[0]?.delta?.content ?? "";
            release(false);
          }
          release(true);
          controller.enqueue(
            encodeSse({ done: true, rung: body.requestedRung, flagged }),
          );
          controller.close();
        } catch {
          controller.enqueue(encodeSse({ error: "Tutor stream interrupted." }));
          controller.close();
        }
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
    return Response.json({ error: "Tutor unavailable. Please retry." }, { status: 502 });
  }
}

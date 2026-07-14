import OpenAI from "openai";

export function createOpenAI(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

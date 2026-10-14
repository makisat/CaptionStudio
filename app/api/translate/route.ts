import { structured, sameOrigin, failure } from "@/lib/openai-server";
import { z } from "zod";
import { languages } from "@/lib/captions";
const schema = z.object({ target: z.string(), source: z.string().max(40), cues: z.array(z.object({ id: z.string().max(100), text: z.string().min(1).max(2000) })).min(1).max(3000) });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure(new Error("Invalid request origin."), 403);
  try {
    const input = schema.parse(await request.json());
    const target = languages.find(l => l[0] === input.target);
    if (!target) throw new Error("Choose a supported target language.");
    const translations: { id: string; text: string }[] = [];
    for (let offset = 0; offset < input.cues.length; offset += 60) {
      const cues = input.cues.slice(offset, offset + 60);
      const result = await structured(`Translate these subtitle phrases from ${input.source} into ${target[1]}. Use adjacent phrases for context. Preserve meaning and tone without adding information. Return exactly one translation for every ID, in order. No timestamps or commentary.`, { cues }, { type: "object", properties: { translations: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false } } }, required: ["translations"], additionalProperties: false });
      if (result.translations.length !== cues.length || result.translations.some((t: { id: string; text: string }, i: number) => t.id !== cues[i].id || !t.text.trim())) throw new Error("Translation returned incomplete captions. Please retry.");
      translations.push(...result.translations);
    }
    return Response.json({ translations });
  } catch (error) { return failure(error); }
}

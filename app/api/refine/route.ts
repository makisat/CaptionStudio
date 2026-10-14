import { structured, sameOrigin, failure } from "@/lib/openai-server";
import { z } from "zod";
const schema = z.object({ language: z.string().max(40), words: z.array(z.object({ id: z.number().int().nonnegative(), text: z.string().min(1).max(500) })).min(1).max(10000) });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure(new Error("Invalid request origin."), 403);
  try {
    const input = schema.parse(await request.json());
    const breaks: number[] = [], fillerIds: number[] = [];
    for (let offset = 0; offset < input.words.length; offset += 500) {
      const words = input.words.slice(offset, offset + 500);
      const result = await structured("You are a multilingual subtitle editor. For Japanese, timestamp tokens may be individual characters or fragments: reconstruct the sentence before choosing boundaries. Never split inside a word, proper noun, compound, number with its counter, or between a verb and its auxiliary. Keep particles with the preceding phrase. Prefer completed clauses and sentences, not every short grammatical unit. Return breakAfterIds: word IDs after which a natural short phrase, clause or sentence ends. Return fillerIds: IDs of optional speech hesitations and conversational fillers. Mark phrases such as 'you know' only when disposable in context. Never mark meaningful words such as 'like' in 'I like this'. Keep repetitions unless they are meaningless stutters. Do not rewrite text or fabricate IDs.", { language: input.language, words }, { type: "object", properties: { breakAfterIds: { type: "array", items: { type: "integer" } }, fillerIds: { type: "array", items: { type: "integer" } } }, required: ["breakAfterIds", "fillerIds"], additionalProperties: false });
      const ids = new Set(words.map(w => w.id));
      breaks.push(...result.breakAfterIds.filter((id: number) => ids.has(id))); fillerIds.push(...result.fillerIds.filter((id: number) => ids.has(id)));
    }
    return Response.json({ breaks: [...new Set(breaks)], fillerIds: [...new Set(fillerIds)] });
  } catch (error) { return failure(error); }
}

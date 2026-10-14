import { basicFillerIds, normalizeWords, type Transcript } from "@/lib/captions";
import { openai, sameOrigin, failure } from "@/lib/openai-server";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure(new Error("Invalid request origin."), 403);
  try {
    if (Number(request.headers.get("content-length")) > 26 * 1024 * 1024) throw new Error("Please upload a file smaller than 25 MB.");
    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File) || !file.size || file.size > 25 * 1024 * 1024) throw new Error("Choose an audio file up to 25 MB.");
    if (!/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(file.name)) throw new Error("Supported formats: MP3, WAV, M4A, MP4, MPEG, MPGA, and WebM.");
    const form = new FormData();
    form.set("file", file); form.set("model", "whisper-1"); form.set("response_format", "verbose_json"); form.append("timestamp_granularities[]", "word");
    form.set("prompt", "Transcribe faithfully, retaining audible hesitations, filler words and repetitions. Include punctuation.");
    const language = String(input.get("language") || "auto");
    if (language === "ja") form.set("prompt", "日本語の音声を、発言どおりに文字起こししてください。句読点を付け、聞こえる『えー』『えっと』『あの』などの言いよどみや繰り返しも残してください。聞こえない内容を補わないでください。");
    if (language !== "auto") { if (!/^[a-z]{2}$/.test(language)) throw new Error("Invalid source language."); form.set("language", language); }
    const result = await openai("audio/transcriptions", form);
    const words = normalizeWords(result.words || []);
    if (!words.length) throw new Error("No speech with word timings was detected. Try a clearer recording.");
    const transcript: Transcript = { words, text: result.text || "", language: result.language || language, duration: Math.max(Number(result.duration) || 0, words[words.length - 1].end), fillerIds: basicFillerIds(words), breaks: [], refined: false };
    return Response.json(transcript);
  } catch (error) { return failure(error); }
}

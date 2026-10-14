export type Word = { id: number; text: string; start: number; end: number };
export type Transcript = { words: Word[]; language: string; duration: number; text: string; fillerIds: number[]; breaks: number[]; refined: boolean };
export type Cue = { id: string; start: number; end: number; text: string; wordIds: number[]; warning?: string };
export type Settings = { maxLength: number; unit: "characters" | "words"; maxLines: number; maxDuration: number; timing: "speech" | "fill"; maxGap: number; fillers: "keep" | "remove"; natural: boolean };
export const defaults: Settings = { maxLength: 42, unit: "characters", maxLines: 2, maxDuration: 6, timing: "speech", maxGap: 1, fillers: "keep", natural: true };
export const languages = [["en", "English"], ["es", "Spanish"], ["ja", "Japanese"], ["zh", "Chinese"], ["ko", "Korean"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["it", "Italian"], ["ar", "Arabic"], ["hi", "Hindi"], ["ru", "Russian"], ["nl", "Dutch"], ["pl", "Polish"], ["tr", "Turkish"], ["vi", "Vietnamese"], ["th", "Thai"], ["id", "Indonesian"], ["uk", "Ukrainian"], ["sv", "Swedish"]] as const;
export function languageName(code: string) { return languages.find(l => l[0] === code)?.[1] ?? code; }
export function charCount(text: string) { return Array.from(text).length; }
export function isJapanese(language: string) { return /^(ja(?:-|$)|japanese$)/i.test(language); }
export function japaneseBoundaries(text: string): Set<number> {
  const edges = new Set<number>();
  for (const segment of new Intl.Segmenter("ja", { granularity: "word" }).segment(text)) {
    const end = segment.index + segment.segment.length;
    const next = text.slice(end);
    if (/[\p{Script=Han}\p{Script=Katakana}0-9０-９]$/u.test(segment.segment) && /^[\p{Script=Han}\p{Script=Katakana}0-9０-９]/u.test(next)) continue;
    // Keep particles, auxiliaries and closing punctuation with their phrase.
    if (!next || !/^(?:[、。，．！？!?）」』】〕〉》ーぁぃぅぇぉゃゅょっァィゥェォャュョッ]|は|が|を|に|へ|で|と|も|の|ね|よ|か|です|ます|ました|ません|だっ|だった|ない|なく|れる|られる|たい|たら|ながら|ので|のに)/u.test(next)) edges.add(end);
    if (/[。！？!?、]$/u.test(segment.segment)) edges.add(end);
  }
  return edges;
}
export function joinWords(words: Pick<Word, "text">[], language = "en") {
  const compact = /^(zh|ja|th)(-|$)|^(chinese|japanese|thai)$/i.test(language);
  return words.map(w => w.text.trim()).join(compact ? "" : " ").replace(/\s+([,.;:!?，。！？、])/gu, "$1");
}
function measure(words: Word[], settings: Settings, language: string) { return settings.unit === "words" ? words.length : charCount(joinWords(words, language)); }
const hesitation = /^(u+m+|u+h+|e+rm+|hmm+|えー|えっと|嗯|呃|어|음|äh|ähm|euh|eh)$/iu;
export function basicFillerIds(words: Word[]) { return words.filter(w => hesitation.test(w.text.replace(/[.,!?，。！？]/gu, "").trim())).map(w => w.id); }
export function wrapText(text: string, maxLines: number, language = "en") {
  if (maxLines <= 1 || charCount(text) < 26) return text;
  if (isJapanese(language) || /[ぁ-んァ-ヶ]/u.test(text)) {
    let split = -1, best = Infinity;
    for (const edge of japaneseBoundaries(text)) {
      if (edge === text.length || edge < text.length * 0.2 || edge > text.length * 0.8) continue;
      const score = Math.abs(edge - text.length / 2) - (/[、。！？]$/u.test(text.slice(0, edge)) ? 4 : 0);
      if (score < best) { split = edge; best = score; }
    }
    return split < 0 ? text : text.slice(0, split) + "\n" + text.slice(split);
  }
  const tokens = /\s/u.test(text) ? text.split(/\s+/u) : Array.from(text);
  if (tokens.length < 2) return text;
  const separator = /\s/u.test(text) ? " " : "";
  let split = 1, best = Infinity;
  for (let i = 1; i < tokens.length; i++) {
    const delta = Math.abs(charCount(tokens.slice(0, i).join(separator)) - charCount(tokens.slice(i).join(separator)));
    if (delta < best) { best = delta; split = i; }
  }
  return tokens.slice(0, split).join(separator) + "\n" + tokens.slice(split).join(separator);
}
export function applyTiming(cues: Cue[], settings: Settings): Cue[] {
  return cues.map((cue, i) => {
    const next = cues[i + 1];
    const limit = Math.min(next?.start ?? Infinity, cue.start + settings.maxDuration);
    const end = settings.timing === "fill" && next && next.start - cue.end <= settings.maxGap ? Math.max(cue.end, limit) : cue.end;
    return { ...cue, end: Math.max(cue.start + 0.001, Math.min(end, next?.start ?? Infinity)) };
  });
}
export function generateCues(transcript: Transcript, settings: Settings): Cue[] {
  const removed = new Set(settings.fillers === "remove" ? transcript.fillerIds : []);
  const words = transcript.words.filter(w => !removed.has(w.id));
  const breaks = new Set(settings.natural ? transcript.breaks : []);
  const japanese = isJapanese(transcript.language);
  const safeEdges = japanese ? japaneseBoundaries(joinWords(words, transcript.language)) : null;
  const wordEdges: number[] = [];
  let characters = 0;
  for (const word of words) { characters += word.text.trim().length; wordEdges.push(characters); }
  const cues: Cue[] = [];
  let offset = 0;
  while (offset < words.length) {
    let stop = offset + 1;
    while (stop < words.length) {
      if (words[stop].start - words[stop - 1].end > (japanese ? 0.8 : 0.45)) break;
      if (words[stop].end - words[offset].start > settings.maxDuration) break;
      if (measure(words.slice(offset, stop + 1), settings, transcript.language) > settings.maxLength) break;
      stop++;
    }
    let chosen = stop;
    if (settings.natural && stop - offset > 2) {
      let score = -Infinity;
      for (let k = offset + 1; k <= stop; k++) {
        if (safeEdges && !safeEdges.has(wordEdges[k - 1]) && k !== words.length) continue;
        const last = words[k - 1];
        const fullness = measure(words.slice(offset, k), settings, transcript.language) / settings.maxLength;
        const punctuation = /[.!?。！？]$/u.test(last.text) ? 1.8 : /[,;:，、]$/u.test(last.text) ? 0.9 : 0;
        const pause = Math.min(0.7, Math.max(0, (words[k]?.start ?? last.end) - last.end));
        const value = fullness + punctuation + pause + (breaks.has(last.id) ? 1.1 : 0) - (fullness < 0.25 && k < stop ? 1.2 : 0);
        if (value > score) { chosen = k; score = value; }
      }
    }
    const group = words.slice(offset, chosen);
    const text = joinWords(group, transcript.language);
    const start = group[0].start;
    const end = Math.max(start + 0.001, group[group.length - 1].end);
    const warning = measure(group, settings, transcript.language) > settings.maxLength ? "A single word exceeds the length limit." : end - start > settings.maxDuration ? "A single word exceeds the duration limit." : undefined;
    cues.push({ id: `w-${group[0].id}-${group[group.length - 1].id}`, start, end, text: wrapText(text, settings.maxLines, transcript.language), wordIds: group.map(w => w.id), warning });
    offset = chosen;
  }
  return applyTiming(cues, settings);
}
export function splitTranslation(source: Cue, text: string, settings: Settings, language: string): Cue[] {
  const compact = /^(zh|ja|th)$/.test(language);
  const tokens = compact ? Array.from(text) : text.trim().split(/\s+/u);
  const groups: string[] = [];
  let group: string[] = [];
  const maximumDuration = Math.max(0.001, source.end - source.start);
  // A secondary length target also avoids long translated cues exceeding duration.
  const durationParts = Math.ceil(maximumDuration / settings.maxDuration);
  const durationLimit = Math.max(1, Math.ceil(tokens.length / durationParts));
  for (const token of tokens) {
    const candidate = [...group, token];
    const count = settings.unit === "words" ? candidate.length : charCount(candidate.join(compact ? "" : " "));
    if (group.length && (count > settings.maxLength || candidate.length > durationLimit)) { groups.push(group.join(compact ? "" : " ")); group = []; }
    group.push(token);
    if (settings.natural && /[.!?。！？]$/u.test(token)) { groups.push(group.join(compact ? "" : " ")); group = []; }
  }
  if (group.length) groups.push(group.join(compact ? "" : " "));
  const total = groups.reduce((sum, value) => sum + charCount(value), 0) || 1;
  let position = source.start;
  return groups.map((value, i) => {
    const end = i === groups.length - 1 ? source.end : position + maximumDuration * charCount(value) / total;
    const result: Cue = { id: `${source.id}-t-${i}`, start: position, end, text: wrapText(value, settings.maxLines, language), wordIds: source.wordIds };
    if ((settings.unit === "characters" ? charCount(value) : value.split(/\s+/u).length) > settings.maxLength) result.warning = "A translated word exceeds the length limit.";
    position = end;
    return result;
  });
}
export function srtTime(seconds: number) {
  const millis = Math.round(Math.max(0, seconds) * 1000);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(Math.floor(millis / 3600000))}:${pad(Math.floor(millis / 60000) % 60)}:${pad(Math.floor(millis / 1000) % 60)},${pad(millis % 1000, 3)}`;
}
export function toSrt(cues: Cue[]) {
  return cues.map((cue, i) => `${i + 1}\r\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\r\n${cue.text.replace(/\r?\n/gu, "\r\n").trim()}`).join("\r\n\r\n") + "\r\n";
}
export function validateCues(cues: Cue[], duration: number): string | null {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue.text.trim()) return `Caption ${i + 1} is empty.`;
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > duration + 0.1) return `Check the timing of caption ${i + 1}.`;
    if (i && Math.round(cue.start * 1000) < Math.round(cues[i - 1].end * 1000)) return `Caption ${i + 1} overlaps the previous caption.`;
  }
  return null;
}
export function normalizeWords(raw: { word: string; start: number; end: number }[]): Word[] {
  let previous = 0;
  return raw.filter(w => typeof w.word === "string" && w.word.trim() && Number.isFinite(w.start) && Number.isFinite(w.end)).map((w, id) => {
    const start = Math.max(0, previous, w.start);
    const end = Math.max(start + 0.001, w.end);
    previous = end;
    return { id, text: w.word.trim(), start, end };
  });
}
export function demoTranscript(): Transcript {
  const phrases = ["Um, every story starts with a voice.", "A small idea, a quiet moment,", "or something you just have to share.", "You know, the right words make a difference.", "Give them room to breathe.", "And let your story travel further."];
  let time = 0.6, id = 0;
  const words: Word[] = [];
  for (const phrase of phrases) {
    for (const text of phrase.split(" ")) { words.push({ id: id++, text, start: time, end: time + 0.32 }); time += 0.38; }
    time += 0.85;
  }
  return { words, language: "en", duration: time, text: phrases.join(" "), fillerIds: [0, ...words.filter(w => ["You", "know,"].includes(w.text)).map(w => w.id)], breaks: words.filter(w => /[.,]$/u.test(w.text)).map(w => w.id), refined: true };
}

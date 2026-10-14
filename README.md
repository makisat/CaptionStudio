# Caption Studio

Audio-to-SRT web app built with React, TypeScript, and Vinext, with a Cloudflare-compatible server.

## Run locally

Requires Node 22.13 or newer. Install dependencies with `npm run install:ci`, then run `npm run dev`. Configure `OPENAI_API_KEY` in the ignored `.env.local` file. `OPENAI_TEXT_MODEL` defaults to `gpt-4o-mini`. API usage requires OpenAI Platform billing or credits, separate from ChatGPT subscriptions.

## Features

- Drag and drop audio (up to 25 MB); Whisper word timestamps with language auto-detection or a manual source language.
- GPT suggests natural phrase boundaries and identifies context-dependent fillers without rewriting source words.
- Caption limits in characters or words, one or two lines, and maximum duration.
- Speech-only timing or hold captions through short gaps, with an adjustable gap threshold.
- Original or translated UTF-8 SRT downloads, with editable text and start/end times.
- Sample transcript for testing the editor without API calls.

The original transcript stays in browser memory so settings do not trigger retranscription. Caption setting changes reset manual edits. Translation is cached for the active target and filler mode; length and timing changes can be applied locally. Translation does not align target words to source audio: subdivisions use estimated proportional timing inside source phrase windows. Removing fillers affects subtitle text only. Whisper may itself omit some fillers even with a preservation prompt.

Audio and text are sent to OpenAI. The app does not persist uploads or transcripts on its server. Download before closing the page. Plain SRT does not embed fonts or visual styles; configure these in the video editor. Long single tokens are preserved with an overflow warning instead of being truncated.

## Verification

`node --test lib/captions.test.ts` tests timing, Unicode, filler preservation/removal, gap filling, translated subdivisions, and SRT output. Run `npx tsc --noEmit` for types and `npm run build` for production.

Production runtime secrets belong in Sites environment variables. `.env.local` is ignored and never published. The hosted app must remain owner-private when using a shared API key.

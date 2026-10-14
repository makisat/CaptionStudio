import { configured } from "@/lib/openai-server";
export async function GET() { return Response.json({ configured: configured() }, { headers: { "Cache-Control": "no-store" } }); }

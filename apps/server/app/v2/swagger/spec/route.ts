import { getSpec } from "../swagger";

// Next.js 15+ no longer caches GET route handlers by default.
export const dynamic = "force-static";

export async function GET() {
  const spec = await getSpec();
  return new Response(JSON.stringify(spec));
}

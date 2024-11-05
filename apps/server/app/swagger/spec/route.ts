import { getSpec } from "../spec";

export async function GET() {
  const spec = await getSpec();
  return new Response(JSON.stringify(spec));
}

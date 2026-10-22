import Yaml from "yaml";
import { getSpec } from "../swagger/swagger";

// Generate the source-based spec at build time for standalone deployments.
export const dynamic = "force-static";

export async function GET() {
  return new Response(Yaml.stringify(await getSpec()), {
    status: 200,
    headers: {
      "Content-Type": "application/x-yaml",
      "Content-Disposition": "attachment; filename=nile-auth.yaml",
    },
  });
}

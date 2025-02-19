import Yaml from "yaml";
import { getSpec } from "../swagger/swagger";

export async function GET() {
  return new Response(Yaml.stringify(await getSpec()), {
    status: 200,
    headers: {
      "Content-Type": "application/x-yaml",
      "Content-Disposition": "attachment; filename=nile-auth.yaml",
    },
  });
}

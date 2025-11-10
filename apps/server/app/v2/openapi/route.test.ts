import SwaggerParser from "@apidevtools/swagger-parser";
import Yaml from "yaml";

import { GET } from "./route";
import { getSpec } from "../swagger/swagger";

describe("GET /openapi", () => {
  it("returns the generated swagger spec as valid YAML", async () => {
    const expectedSpec: any = await getSpec();

    expect(expectedSpec).toMatchObject({
      openapi: "3.0.0",
      info: expect.objectContaining({
        title: expect.any(String),
        version: expect.any(String),
      }),
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.headers.get("Content-Type")).toBe("application/x-yaml");
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=nile-auth.yaml",
    );

    const body = await response.text();
    const parsed = Yaml.parse(body);
    expect(parsed).toEqual(expectedSpec);
    const validated = await SwaggerParser.validate(
      JSON.parse(JSON.stringify(parsed)) as any,
    );
    expect(validated.openapi).toBe("3.0.0");
    expect(validated.info).toMatchObject(expectedSpec.info);
    expect(typeof validated.paths).toBe("object");
    expect(Object.keys(validated.paths ?? {})).not.toHaveLength(0);
    expect(
      parsed.paths?.["/v2/databases/{database}/auth/mfa"]?.delete,
    ).toBeDefined();
  });
});

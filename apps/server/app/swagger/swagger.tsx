import { createSwaggerSpec } from "next-swagger-doc";
export async function getSpec() {
  const spec = createSwaggerSpec({
    apiFolder: "app",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Nile auth API",
        version: "0.1",
      },
    },
  });
  return spec;
}

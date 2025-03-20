import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import "./swagger.css";

import { getSpec } from "./swagger";
import { Form } from "./ui/form";

export default async function Swagger() {
  const spec = await getSpec();
  return (
    <div>
      <form className="form" autoComplete="off">
        <div className="warning">
          Warning: this is sending developer credentials across the wire. We
          recommend deleting the credentials after testing this out.
        </div>
        <Form />
      </form>

      {/** @ts-ignore  https://github.com/swagger-api/swagger-ui/issues/10243 */}
      <SwaggerUI spec={spec} />
    </div>
  );
}

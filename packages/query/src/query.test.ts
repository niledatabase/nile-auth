import { queryByReq } from "./query";

const { log } = console;

describe.skip("query", () => {
  it("connects locally", async () => {
    const req = new Request(
      "http://localhost:8080/01920a94-8e90-718d-be5e-e4850935fed4",
    );
    const sql = await queryByReq(req);
    const res = await sql`
      SELECT
        *
      FROM
        tenants
    `;
    log(res);
  });
});

import { getSecureCookies } from "./next-auth/cookies";

describe("buildOptionsFromReq", () => {
  beforeEach(() => {
    process.env.NILEDB_USER = "something";
    process.env.NILEDB_PASSWORD = "something";
    process.env.NILEDB_HOST = "localhost:7432";
  });
  afterAll(() => {
    process.env.NILEDB_USER = "";
    process.env.NILEDB_PASSWORD = "";
    process.env.NILEDB_HOST = "";
  });
  it("defaults to secure cookies", () => {
    const url = "http://localhost";
    const req = new Request(url, {
      headers: { "niledb-origin": url },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(false);
  });
  it("disables secure cookies", () => {
    const url = "http://localhost";
    const req = new Request(url, {
      headers: { "niledb-origin": url, "niledb-useSecureCookies": "yeah" },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(false);
  });
  it("forces secure cookies", () => {
    const url = "https://localhost";
    const req = new Request(url, {
      headers: { "niledb-origin": url, "niledb-useSecureCookies": "true" },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(true);
  });
});

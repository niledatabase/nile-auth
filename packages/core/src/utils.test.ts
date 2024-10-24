import { getSecureCookies } from "./nextOptions";

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
  it("makes a good config", () => {
    const url = "http://localhost";
    const req = new Request(url, {
      headers: { "niledb-origin": url },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(false);
  });
  it("makes a good config", () => {
    const url = "http://localhost";
    const req = new Request(url, {
      headers: { "niledb-origin": url, "niledb-useSecureCookies": "yeah" },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(true);
  });
  it("makes a good config", () => {
    const url = "https://localhost";
    const req = new Request(url, {
      headers: { "niledb-origin": url },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(true);
  });
});

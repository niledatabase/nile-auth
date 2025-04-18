import {
  getSecureCookies,
  HEADER_ORIGIN,
  HEADER_SECURE_COOKIES,
  X_NILE_ORIGIN,
  X_SECURE_COOKIES,
} from "./next-auth/cookies";

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

  describe("deprecated", () => {
    it("defaults to secure cookies", () => {
      const url = "http://localhost";
      const req = new Request(url, {
        headers: { [X_NILE_ORIGIN]: url },
      });
      const opts = getSecureCookies(req);
      expect(opts).toEqual(false);
    });
    it("disables secure cookies", () => {
      const url = "http://localhost";
      const req = new Request(url, {
        headers: { [X_NILE_ORIGIN]: url, [X_SECURE_COOKIES]: "yeah" },
      });
      const opts = getSecureCookies(req);
      expect(opts).toEqual(false);
    });
    it("forces secure cookies", () => {
      const url = "https://localhost";
      const req = new Request(url, {
        headers: { [X_NILE_ORIGIN]: url, [X_SECURE_COOKIES]: "true" },
      });
      const opts = getSecureCookies(req);
      expect(opts).toEqual(true);
    });
  });

  it("defaults to secure cookies", () => {
    const url = "http://localhost";
    const req = new Request(url, {
      headers: { [HEADER_ORIGIN]: url },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(false);
  });
  it("disables secure cookies", () => {
    const url = "http://localhost";
    const req = new Request(url, {
      headers: { [HEADER_ORIGIN]: url, [HEADER_SECURE_COOKIES]: "yeah" },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(false);
  });
  it("forces secure cookies", () => {
    const url = "https://localhost";
    const req = new Request(url, {
      headers: { [HEADER_ORIGIN]: url, [HEADER_SECURE_COOKIES]: "true" },
    });
    const opts = getSecureCookies(req);
    expect(opts).toEqual(true);
  });
});

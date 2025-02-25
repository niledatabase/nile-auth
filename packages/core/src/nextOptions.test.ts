import { nextOptions } from "./nextOptions";

jest.mock("./next-auth/getProviders", () => ({
  getProviders: async () => [],
}));
describe("nile-auth", () => {
  it("makes a useable next auth config", async () => {
    const req = new Request("https://somewebsite.com", {
      headers: { "nile.origin": "https://localhost" },
    });
    const [config] = await nextOptions(req, {
      host: "",
      database: "",
      user: "",
      password: "",
      port: 0,
    });
    expect(config?.useSecureCookies).toEqual(true);
    expect(config?.cookies?.sessionToken?.name).toEqual(
      "__Secure-nile.session-token",
    );
  });
});

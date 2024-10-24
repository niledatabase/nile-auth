import NileAdapter from "./index";

describe("adapter", () => {
  it("has the necessary methods", () => {
    const adapter = NileAdapter({
      user: "username",
      database: "database",
      password: "password",
      port: 5432,
      host: "host",
      providers: [],
    });
    const methods = Object.keys(adapter);
    expect(methods.sort()).toEqual(
      [
        "createVerificationToken",
        "useVerificationToken",
        "createUser",
        "getUser",
        "getUserByEmail",
        "getUserByAccount",
        "updateUser",
        "linkAccount",
        "createSession",
        "getSessionAndUser",
        "updateSession",
        "deleteSession",
        "unlinkAccount",
        "deleteUser",
      ].sort(),
    );
  });
});

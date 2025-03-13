import { cleanUrl } from "./report";

describe("report", () => {
  it("cleans a database url", () => {
    const req = new Request(
      "http://localhost:3001/v2/databases/01957187-cff5-7346-adf1-9703a1869acc/auth/session",
    );
    expect(cleanUrl(req)).toEqual("/v2/databases/{database_id}/auth/session");
  });
  it("cleans a tenant url", () => {
    const req = new Request(
      "http://localhost:3001/v2/databases/01957187-cff5-7346-adf1-9703a1869acc/tenants/01957187-cff5-7346-adf1-9703a1869acc/users/01957187-cff5-7346-adf1-9703a1869acc/link",
    );
    expect(cleanUrl(req)).toEqual(
      "/v2/databases/{database_id}/tenants/{tenant_id}/users/{user_id}/link",
    );
  });
  it("cleans a user url", () => {
    const req = new Request(
      "http://localhost:3001/v2/databases/01957187-cff5-7346-adf1-9703a1869acc/users/01957187-cff5-7346-adf1-9703a1869acc/tenants",
    );
    expect(cleanUrl(req)).toEqual(
      "/v2/databases/{database_id}/users/{user_id}/tenants",
    );
  });
  it("cleans a reset password", () => {
    const req = new Request(
      "http://localhost:3001/v2/databases/01957187-cff5-7346-adf1-9703a1869acc/auth/reset-password",
    );
    expect(cleanUrl(req)).toEqual(
      "/v2/databases/{database_id}/auth/reset-password",
    );
  });
});

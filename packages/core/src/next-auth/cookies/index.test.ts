import { setTenantCookie } from "./index";
import { TENANT_COOKIE } from "./constants";

describe("setTenantCookie", () => {
  const tenantHeader = "set-cookie";
  const tenantOne = "ea83a1e2-1c08-4c1d-8e7a-2f6e6a5c3b87";
  const tenantTwo = "5b3b9a88-3dbc-4cf8-8ad6-5a0e2775a204";

  function buildRequest(cookie?: string) {
    const headers = cookie ? { cookie } : undefined;
    return new Request("https://example.com", {
      headers,
    });
  }

  it("sets the tenant cookie the first time the user signs in", () => {
    const req = buildRequest();
    const headers = setTenantCookie(req, [{ id: tenantOne, name: "Tenant 1" }]);

    expect(headers).toBeDefined();
    expect(headers?.get(tenantHeader)).toEqual(
      `${TENANT_COOKIE}=${tenantOne}; Path=/; SameSite=lax`,
    );
  });

  it("keeps the tenant cookie when switching between valid tenants", () => {
    const req = buildRequest(`${TENANT_COOKIE}=${tenantOne}`);
    const headers = setTenantCookie(req, [
      { id: tenantOne, name: "Tenant 1" },
      { id: tenantTwo, name: "Tenant 2" },
    ]);

    expect(headers).toBeUndefined();
  });

  it("replaces the tenant cookie when a different user signs in", () => {
    const req = buildRequest(`${TENANT_COOKIE}=old-tenant`);
    const headers = setTenantCookie(req, [
      { id: tenantTwo, name: "Tenant 2" },
      { id: tenantOne, name: "Tenant 1" },
    ]);

    expect(headers).toBeDefined();
    expect(headers?.get(tenantHeader)).toEqual(
      `${TENANT_COOKIE}=${tenantTwo}; Path=/; SameSite=lax`,
    );
  });

  it("removes the tenant cookie when the user no longer belongs to any tenant", () => {
    const req = buildRequest(`${TENANT_COOKIE}=${tenantOne}`);
    const headers = setTenantCookie(req, []);

    expect(headers).toBeDefined();
    expect(headers?.get(tenantHeader)).toEqual(
      `${TENANT_COOKIE}=; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  });

  it("does nothing when no tenant information is available", () => {
    const req = buildRequest();
    const headers = setTenantCookie(req, []);

    expect(headers).toBeUndefined();
  });
});

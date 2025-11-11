const poolInstances: Array<{ end: jest.Mock }> = [];

jest.mock("pg", () => ({
  Pool: jest.fn(() => {
    const instance = {
      end: jest.fn().mockResolvedValue(undefined),
    };
    poolInstances.push(instance);
    return instance;
  }),
}));

jest.mock("@nile-auth/query", () => ({
  query: jest.fn(),
}));

import { query } from "@nile-auth/query";
import * as utils from "./utils";
import {
  fetchMfaUser,
  fetchProviderConfig,
  deleteSessionToken,
} from "./sql";
import { ProviderNames } from "../types";
import { normalizeConfig } from "./utils";

const queryMock = query as jest.MockedFunction<typeof query>;

describe("mfa/sql", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    poolInstances.length = 0;
  });

  describe("fetchMfaUser", () => {
    it("returns null when no identifier is provided", async () => {
      const sqlMock = jest.fn();
      const result = await fetchMfaUser(sqlMock as any, {});
      expect(result).toBeNull();
      expect(sqlMock).not.toHaveBeenCalled();
    });

    it("queries by user id when provided", async () => {
      const row = {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        multi_factor: null,
      };
      const sqlMock = jest.fn().mockResolvedValue({
        rowCount: 1,
        rows: [row],
      });

      const result = await fetchMfaUser(sqlMock as any, { userId: "user-1" });

      expect(sqlMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(row);
    });

    it("queries by email when user id is missing", async () => {
      const row = {
        id: "user-2",
        email: "person@example.com",
        name: "Person",
        multi_factor: null,
      };
      const sqlMock = jest.fn().mockResolvedValue({
        rowCount: 1,
        rows: [row],
      });

      const result = await fetchMfaUser(sqlMock as any, {
        email: "person@example.com",
      });

      expect(sqlMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(row);
    });

    it("returns null when no rows are returned", async () => {
      const sqlMock = jest.fn().mockResolvedValue({
        rowCount: 0,
        rows: [],
      });

      const result = await fetchMfaUser(sqlMock as any, { userId: "missing" });

      expect(result).toBeNull();
    });
  });

  describe("fetchProviderConfig", () => {
    it("returns null when provider name is missing", async () => {
      const sqlMock = jest.fn();
      await expect(
        fetchProviderConfig(sqlMock as any, undefined),
      ).resolves.toBeNull();
      expect(sqlMock).not.toHaveBeenCalled();
    });

    it("returns normalized config when provider is found", async () => {
      const resultConfig = { email: true, authenticator: false };
      const sqlMock = jest.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ config: { email: 1 } }],
      });
      const spy = jest.spyOn(utils, "normalizeConfig");
      spy.mockReturnValue(resultConfig);

      await expect(
        fetchProviderConfig(sqlMock as any, ProviderNames.Email),
      ).resolves.toEqual(resultConfig);

      expect(sqlMock).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ email: 1 });
      spy.mockRestore();
    });

    it("returns null when provider is not found", async () => {
      const sqlMock = jest.fn().mockResolvedValue({
        rowCount: 0,
        rows: [],
      });

      await expect(
        fetchProviderConfig(sqlMock as any, ProviderNames.Email),
      ).resolves.toBeNull();
    });
  });

  describe("deleteSessionToken", () => {
    it("returns early when db info or session token is missing", async () => {
      await deleteSessionToken({ dbInfo: undefined, sessionToken: "token" });
      await deleteSessionToken({ dbInfo: {} as any, sessionToken: undefined });
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("deletes session tokens and closes the pool", async () => {
      const sqlMock = jest.fn().mockResolvedValue(undefined);
      queryMock.mockResolvedValueOnce(sqlMock);

      await deleteSessionToken({
        dbInfo: { host: "localhost" } as any,
        sessionToken: "token-123",
      });

      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(sqlMock).toHaveBeenCalledTimes(1);
      expect(poolInstances).toHaveLength(1);
      expect(poolInstances[0].end).toHaveBeenCalled();
    });
  });
});

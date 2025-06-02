import { NextRequest } from "next/server";
import { auth } from "@nile-auth/core";
import { queryByReq } from "@nile-auth/query";
import { DELETE } from "./route";

const mockResponder = jest.fn();
const mockReporter = { error: jest.fn() };
jest.mock("../../../../../../../../../../packages/query/src/query", () => ({
  queryBySingle: jest.fn(),
  queryByReq: jest.fn(),
}));
jest.mock("../../../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));
jest.mock(
  "../../../../../../../../../../packages/logger/src/ResponseLogger",
  () => {
    return {
      ResponseLogger: jest.fn(() => [mockResponder, mockReporter]),
    };
  },
);
describe("DELETE /invite", () => {
  it("deletes an invite successfully", async () => {
    const commands: string[] = [];

    const sql = async (
      strings: TemplateStringsArray,
      ...values: any[]
    ): Promise<any[]> => {
      let text = strings[0] ?? "";

      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }

      values.forEach((val, idx) => {
        text = text.replace(`$${idx + 1}`, val);
      });

      text = text.replace(/(\n\s+)/g, " ").trim();
      commands.push(text);

      return [null, null, { rowCount: 1 }];
    };

    (queryByReq as jest.Mock).mockResolvedValue(sql);

    (auth as jest.Mock).mockResolvedValue([{ user: { id: "user-abc-123" } }]);

    const req = { url: "http://localhost" };

    await DELETE(req as unknown as NextRequest, {
      params: {
        database: "db",
        tenantId: "tenant-xyz",
        inviteId: "invite-123",
      },
    });

    expect(mockResponder).toHaveBeenCalledWith(null, { status: 204 });

    expect(commands).toEqual([
      ":SET LOCAL nile.tenant_id = 'tenant-xyz'; :SET LOCAL nile.user_id = 'user-abc-123'; DELETE FROM auth.invites WHERE id = invite-123;",
    ]);
  });
});

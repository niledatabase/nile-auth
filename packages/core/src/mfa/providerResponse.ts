import { DbCreds } from "@nile-auth/query/getDbInfo";
import { findCallbackCookie } from "../next-auth/cookies";
import { ProviderNames } from "../types";
import { ChallengeScope, SetupChallengeResult } from ".";
import { query } from "@nile-auth/query";
import { debug, info, warn } from "console";
import { Pool } from "pg";
import { fetchMfaUser, fetchProviderConfig } from "./sql";
import {
  MfaConfig,
  ChallengeRecord,
  MfaUserRow,
  MultiFactorMethod,
  SqlClient,
} from "./types";
import {
  generateNumericCode,
  isMultiFactorMethod,
  maskEmail,
  normalizeConfig,
  resolveConfigMethod,
} from "./utils";
import { authenticator } from "otplib";
import { randomString } from "../utils";
import { send2FaEmail } from "../next-auth/providers/email";
import { CHALLENGE_PREFIX, DEFAULT_ISSUER, SETUP_PREFIX } from "./constants";
import { storeAuthenticatorSecret } from "./recoveryKeys";
import { createHash } from "../next-auth/csrf";

export async function buildProviderMfaResponse(
  req: Request,
  handler: Response,
  dbInfo: DbCreds,
  params: { nextauth: string[] },
): Promise<Response | null> {
  const segments = params?.nextauth ?? [];
  const isCallbackRoute = segments[0] === "callback";
  const isCredentials = segments[1] === "credentials";
  if (!isCallbackRoute || !isCredentials) {
    return null;
  }
  // 401 is ok, because its a sign in that was rejected.
  if (handler.status > 401) {
    return null;
  }

  let email;
  let callback;
  let callbackCookie = findCallbackCookie(req);
  try {
    const form = await req.clone();
    const fd = await form.formData();
    email = fd.get("email");
    const cb = fd.get("callbackUrl");
    if (typeof cb === "string") {
      callback = cb;
    }
  } catch {
    // I don't think this is possible with sign in, its a form post
    const json = await req.json();
    email = json.email;
  }

  if (!email) {
    return null;
  }

  try {
    const mfaResponse = await getMfaResponse({
      req,
      dbInfo,
      email: String(email),
      provider: ProviderNames.MultiFactor,
    });

    if (!mfaResponse) {
      return null;
    }

    let url = new URL(callbackCookie);

    if (callback?.startsWith("/")) {
      const duckUrl = new URL(callbackCookie);
      url = new URL(`${duckUrl.origin}${callback}`);
    }

    url.searchParams.append("token", mfaResponse.token);
    url.searchParams.append("method", mfaResponse.method);
    url.searchParams.append("scope", mfaResponse.scope);

    return new Response(JSON.stringify({ ...mfaResponse, url }), {
      status: 401,
      headers: {
        "content-type": "application/json",
      },
    });
  } catch (e) {
    console.log(e);
    return null;
  }
}

export async function getMfaResponse(params: {
  req: Request;
  dbInfo?: DbCreds;
  userId?: string;
  email?: string;
  provider?: string | ProviderNames | null;
  config?: Partial<MfaConfig> | null;
  forceSetup?: boolean;
}): Promise<ChallengeRecord | SetupChallengeResult | null> {
  const {
    req,
    dbInfo,
    userId,
    email,
    provider,
    config: configOverride,
    forceSetup = false,
  } = params;

  if (!dbInfo || (!userId && !email)) {
    return null;
  }

  const pool = new Pool(dbInfo);
  try {
    const sql = await query(pool);
    const user = await fetchMfaUser(sql, { userId, email });
    if (!user) {
      return null;
    }

    const storedMethod = isMultiFactorMethod(user.multi_factor)
      ? user.multi_factor
      : null;

    const localConfig = normalizeConfig(configOverride);
    const config = localConfig ?? (await fetchProviderConfig(sql, provider));

    if (!forceSetup && storedMethod) {
      const challenge = await createChallenge({
        req,
        sql,
        userId: user.id,
        userEmail: user.email ?? undefined,
        userName: user.name ?? undefined,
        method: storedMethod,
        scope: ChallengeScope.Challenge,
      });

      debug("Created MFA challenge", {
        userId: user.id,
        method: challenge.method,
        expiresAt: challenge.expiresAt,
      });

      info("sending authenticator MFA challenge");
      return challenge;
    }

    const method = storedMethod ?? resolveConfigMethod(config);
    if (!method) {
      warn("No method set to MFA");
      return null;
    }

    const setup = await issueSetupChallenge({
      req,
      sql,
      user,
      method,
    });

    debug("Issued MFA setup challenge", {
      userId: user.id,
      method: setup.method,
      expiresAt: setup.expiresAt,
    });

    return setup;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function issueSetupChallenge(params: {
  req: Request;
  sql: SqlClient;
  user: MfaUserRow;
  method: MultiFactorMethod;
}): Promise<SetupChallengeResult> {
  const { sql, user, method, req } = params;

  let secret: string | undefined;
  let otpauthUrl: string | undefined;
  let maskedEmail: string | undefined;
  let recoveryKeys: string[] | undefined;

  if (method === MultiFactorMethod.Authenticator) {
    secret = authenticator.generateSecret();
    const vars = await sql`
      SELECT
        *
      FROM
        auth.template_variables
    `;

    const issuer =
      vars && "rows" in vars
        ? vars.rows.find((r: { name: string }) => r.name === "app_name")?.value
        : DEFAULT_ISSUER;

    const issuerName =
      (typeof issuer === "string" && issuer.trim().length > 0
        ? issuer
        : undefined) ?? DEFAULT_ISSUER;

    recoveryKeys = await storeAuthenticatorSecret({
      sql,
      userId: user.id,
      secret,
      email: user.email,
      issuer: issuerName,
    });

    const label = user.email ?? user.id;
    otpauthUrl = authenticator.keyuri(label, issuerName, secret);
  } else if (method === MultiFactorMethod.Email) {
    maskedEmail = maskEmail(user.email);
  }

  const challenge = await createChallenge({
    req,
    sql,
    userId: user.id,
    userEmail: user.email ?? undefined,
    userName: user.name ?? undefined,
    method,
    scope: ChallengeScope.Setup,
  });

  return {
    token: challenge.token,
    expiresAt: challenge.expiresAt,
    scope: challenge.scope,
    method,
    secret,
    otpauthUrl,
    maskedEmail,
    recoveryKeys,
  };
}

async function createChallenge(params: {
  req: Request;
  sql: SqlClient;
  userId: string;
  userEmail?: string;
  userName?: string;
  method: MultiFactorMethod;
  scope?: ChallengeScope;
}): Promise<ChallengeRecord> {
  const {
    req,
    sql,
    userId,
    userEmail,
    userName,
    method,
    scope = ChallengeScope.Challenge,
  } = params;

  const challengeToken = randomString(48);
  const prefix =
    scope === ChallengeScope.Setup ? SETUP_PREFIX : CHALLENGE_PREFIX;
  const identifier = `${prefix}${challengeToken}`;
  const expiresInterval =
    method === MultiFactorMethod.Authenticator ? "30 seconds" : "2 minutes";
  const fallbackExpires = new Date(
    Date.now() +
      (method === MultiFactorMethod.Authenticator ? 30 * 1000 : 2 * 60 * 1000),
  ).toISOString();

  const payload: Record<string, unknown> = {
    userId,
    method,
    created: new Date().toISOString(),
  };

  let emailOtp: string | undefined;

  if (method === MultiFactorMethod.Email) {
    if (!userEmail) {
      throw new Error("Cannot send email MFA challenge without a user email");
    }
    emailOtp = generateNumericCode(6);
    const hashedOtp = await createHash(
      `${emailOtp}${process.env.NEXTAUTH_SECRET ?? ""}`,
    );
    payload.otp = hashedOtp;
    payload.length = emailOtp.length;
  }

  const insertResult = await sql`
    INSERT INTO
      auth.verification_tokens (identifier, token, expires)
    VALUES
      (
        ${identifier},
        ${JSON.stringify(payload)},
        NOW() + ${expiresInterval}::interval
      )
    ON CONFLICT (identifier) DO UPDATE
    SET
      token = EXCLUDED.token,
      expires = NOW() + ${expiresInterval}::interval
    RETURNING
      expires
  `;
  const expiresValue =
    insertResult && "rows" in insertResult && insertResult.rows[0]?.expires;
  const expiresAt = expiresValue
    ? new Date(expiresValue).toISOString()
    : fallbackExpires;

  if (method === MultiFactorMethod.Email && emailOtp) {
    try {
      await send2FaEmail({
        req,
        json: {
          email: userEmail!,
          name: userName,
          otp: emailOtp,
        },
      });
    } catch (e) {
      await sql`
        DELETE FROM auth.verification_tokens
        WHERE
          identifier = ${identifier}
      `;
      throw e;
    }
  }

  return {
    token: challengeToken,
    expiresAt,
    method,
    scope,
  };
}

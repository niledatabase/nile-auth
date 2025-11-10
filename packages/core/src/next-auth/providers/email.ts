import EmailProvider from "next-auth/providers/email";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { User as NextAuthUser } from "next-auth";

import {
  ErrorResultSet,
  queryByInfo,
  queryByReq,
  queryBySingle,
  ResultSet,
} from "@nile-auth/query";
import {
  EventEnum,
  Logger,
  ResponderFn,
  ResponseLogger,
} from "@nile-auth/logger";
import { DbCreds } from "@nile-auth/query/getDbInfo";
import { randomString } from "../../utils";
import { findCallbackCookie } from "../cookies";
import { validCsrfToken } from "../csrf";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";
const { info, warn, debug } = Logger("emailProvider");

export class EmailError extends Error {
  public cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "EmailError";
    this.cause = cause;
  }
}

export type Variable = { name: string; value?: string };

type EmailTemplate =
  | "email_invitation"
  | "password_reset"
  | "verify_email"
  | "invite_user"
  | "password_alert"
  | "mfa_code";
function isEmpty(row: ResultSet<Record<string, string>[]> | undefined) {
  return row && "rowCount" in row && row.rowCount === 0;
}
export default async function Email(
  creds: DbCreds,
  config?: {
    emailTemplate: EmailTemplate;
  },
) {
  const sql = await queryByInfo(creds);
  const { emailTemplate = "email_invitation" } = config ?? {};

  const [[serverExist], [templateExists], [variablesExist]] = await Promise.all(
    [
      sql`
        SELECT
          1
        FROM
          information_schema.tables
        WHERE
          table_name = 'email_servers'
          AND table_schema = 'auth'
      `,
      sql`
        SELECT
          1
        FROM
          information_schema.tables
        WHERE
          table_name = 'email_templates'
          AND table_schema = 'auth'
      `,
      sql`
        SELECT
          1
        FROM
          information_schema.tables
        WHERE
          table_name = 'template_variables'
          AND table_schema = 'auth'
      `,
    ],
  );
  if (
    isEmpty(serverExist) ||
    isEmpty(templateExists) ||
    isEmpty(variablesExist)
  ) {
    return null;
  }

  const [[servers], [templates], [vars]] = await Promise.all([
    sql`
      SELECT
        *
      FROM
        auth.email_servers
      ORDER BY
        created DESC
      LIMIT
        1
    `,
    sql`
      SELECT
        *
      FROM
        auth.email_templates
      WHERE
        name = ${emailTemplate}
    `,
    sql`
      SELECT
        *
      FROM
        auth.template_variables
    `,
  ]);

  if (templates && "rowCount" in templates && templates.rowCount === 0) {
    throw new Error("Unable to find email template for action");
  }

  if (servers && "name" in servers) {
    throw new Error("Unable to find email template for action");
  }
  if (templates && "name" in templates) {
    throw new Error("Unable to find email template for action");
  }
  const [server] =
    servers && "rows" in servers ? (servers.rows as unknown as Server[]) : [];
  const [template] = templates && "rows" in templates ? templates.rows : [];
  const variables =
    vars && "rows" in vars ? (vars.rows as unknown as Variable[]) : [];

  if (!server) {
    throw new Error("No email servers are configured.");
  }
  if (!template) {
    throw new Error(
      "Template for sending email invite is missing from database.",
    );
  }
  const replacedFrom = replaceVars(String(template.sender), variables);
  const initialFrom = replacedFrom ? replacedFrom : "noreply@thenile.dev";

  return EmailProvider({
    server: server.server,
    from: initialFrom,
    sendVerificationRequest: async function sendVerificationRequest(params) {
      const { identifier, url } = params;

      const { body, subject, from } = await generateEmailBody({
        email: identifier,
        template: template as unknown as Template,
        variables,
        url,
      });
      if (!body) {
        throw new Error("Unable to generate email from template");
      }

      try {
        await sendEmail({
          body,
          url: String(server.server),
          to: identifier,
          from: from ? from : initialFrom,
          subject,
        });
      } catch (e) {
        if (e instanceof Error) {
          warn("Unable to send email", { stack: e.stack, message: e.message });
        }
      }
    },
  });
}

export async function sendEmail({
  body,
  url,
  to,
  from,
  subject,
}: {
  body: string;
  url: string;
  to: string;
  from: string;
  subject: string;
}) {
  try {
    const html = body;

    const transportOptions: SMTPTransport.Options = {
      url,
      to,
      from,
      sender: from,
      html,
      subject,
    };

    debug("sending email", { transportOptions });
    const transport = createTransport(transportOptions);

    const result = await transport.sendMail(transportOptions);
    debug("mail sending response", { result });

    const failed = result.rejected.concat(result.pending).filter(Boolean);
    if (failed.length) {
      throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
    }
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      "responseCode" in e &&
      e.responseCode !== 421
    ) {
      warn("unable to send email", { error: e });
    }
    if (e instanceof Error) {
      throw new Error(e.message);
    }
  }
}

export type User = { name: string; email: string };
export type Template = { subject: string; body: string; sender: string };
export type Server = {
  variables: Record<NileAuthFields, string>;
  server: string;
};
export type NileAuthFields =
  | "api_url"
  | "user.name"
  | "user.email"
  | "app_name"
  | "sender"
  | "tenant_name";

export function generateEmailBody(params: {
  email: string;
  username?: string;
  template: void | Template;
  variables: Variable[];
  url: string;
  tenantName?: string;
}) {
  const { tenantName = "", email, template, username, url } = params;

  let api_url;
  try {
    const localUrl = new URL(url);
    api_url = `${localUrl.origin}${localUrl.pathname}${localUrl.searchParams.size > 0 ? `?${localUrl.searchParams}` : ""}`;
  } catch (e) {
    // bad url, oh no
  }

  let from = template?.sender;
  const possibleSender = params.variables.find(({ name }) => name === "sender");
  if (possibleSender && !from) {
    from = possibleSender?.value;
  }

  // if you accidentally deleted this, we should save you from the generic
  from = replaceVars(
    String(template?.sender ? template?.sender : "${sender}"),
    params.variables,
  );

  if (!from || !validSender(from, params.variables, template)) {
    from = "noreply@thenile.dev";
  }

  const replacers = [
    ...params.variables,
    { name: "user.name", value: username },
    { name: "user.email", value: email },
    { name: "sender", value: from },
    { name: "api_url", value: api_url },
    { name: "tenant_name", value: tenantName },
  ] as Variable[];

  const subject = replaceVars(String(template?.subject), replacers);
  return {
    body: replaceVars(String(template?.body), replacers),
    subject,
    from,
  };
}

function replaceVars(html: string, replacers: Variable[]) {
  if (!replacers) return html;
  let processedHtml = html;
  for (const item of replacers) {
    if (item.value) {
      const placeholder = `\${${item.name}}`; // Format: ${key}
      processedHtml = processedHtml.replaceAll(placeholder, item.value);
    }
  }

  return processedHtml;
}

export function checkEmail(email: string) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}
export function validSender(
  email: string,
  vars?: Variable[],
  template?: void | Template,
) {
  const validEmail = checkEmail(email);
  if (!validEmail) {
    info("Attempted to send email with invalid sender", {
      email,
      template_variables: vars,
      template,
    });
  }
  return validEmail;
}

export async function sendVerifyEmail(params: { req: Request }) {
  const { req } = params;
  const [responder] = ResponseLogger(req, EventEnum.VERIFY_EMAIL);
  const preserve = await req.clone();
  const formData = await preserve.formData();
  const email = String(formData.get("email"));
  const callbackUrl = String(formData.get("callbackUrl"));
  const csrfToken = formData.get("csrfToken");
  const redirectUrl = formData.get("redirectUrl");
  const [hasValidToken, csrf] = await validCsrfToken(
    req,
    process.env.NEXTAUTH_SECRET,
  );
  if (!hasValidToken || csrf !== csrfToken) {
    return responder("Request blocked", { status: 400 });
  }
  let callback;
  try {
    const callbackCookie = findCallbackCookie(req);
    callback = new URL(callbackCookie);
  } catch (e) {
    return responder("Callback is not a valid url", { status: 400 });
  }

  // the url that redirects
  const url =
    typeof redirectUrl === "string"
      ? redirectUrl
      : `${callback.origin}/api/auth/verify-email`;

  const sqlOne = await queryBySingle({ req, responder });
  const sqlMany = await queryByReq(req as Request);
  const [variables] = await sqlMany`
    SELECT
      *
    FROM
      auth.template_variables
  `;

  const {
    rows: [user],
    error,
  } = await sqlOne`
    SELECT
      *
    FROM
      users.users
    WHERE
      email = ${email}
  `;

  // if we don't have a user, don't tell anyone
  if (!user) {
    return responder(null, { status: 200 });
  }
  if (error) {
    return responder(error);
  }
  const [
    {
      rows: [template],
      error: templateError,
    },
    {
      rows: [server],
      error: serverError,
    },
  ] = await Promise.all([
    sqlOne`
      SELECT
        *
      FROM
        auth.email_templates
      WHERE
        name = 'verify_email'
    `,
    sqlOne`
      SELECT
        *
      FROM
        auth.email_servers
      ORDER BY
        created DESC
      LIMIT
        1
    `,
  ]);

  if (templateError) {
    return responder(
      "Unable to send verification email, the 'verify_email' template is missing from auth.email_templates",
      { status: 400 },
    );
  }

  if (serverError) {
    return responder("Email sending is not configured", { status: 400 });
  }

  const FOUR_HOURS_FROM_NOW = new Date(
    Date.now() + 1000 * 60 * 60 * 4,
  ).toISOString();

  const token = randomString(32);

  const identifier = email;
  await sqlOne`
    INSERT INTO
      auth.verification_tokens (identifier, token, expires)
    VALUES
      (
        ${identifier},
        ${token},
        ${FOUR_HOURS_FROM_NOW}
      )
    ON CONFLICT (identifier) DO UPDATE
    SET
      token = EXCLUDED.token,
      expires = EXCLUDED.expires
  `;

  const searchParams = new URLSearchParams({
    token,
    identifier,
    callbackUrl,
  });

  const { from, body, subject } = await generateEmailBody({
    email: user?.email,
    username: user?.name,
    template: template as Template,
    variables:
      variables && "rows" in variables ? (variables.rows as Variable[]) : [],
    url: `${url}?${searchParams.toString()}`,
  });

  try {
    await sendEmail({
      body,
      to: user.email,
      from,
      subject,
      url: String(server?.server),
    });
  } catch {
    return responder(
      "An email address that uses SSO must have their email verified in order to use credentials.",
      {
        status: 401,
      },
    );
  }

  return responder(null, { status: 201 });
}

export async function sendPasswordHasBeenReset(params: {
  req: Request;
  responder: ResponderFn;
  user: NextAuthUser;
}) {
  const { req, responder, user } = params;
  const emailSetup = await setupEmail({
    req,
    responder,
    template: "password_alert",
  });
  if (emailSetup instanceof Response) {
    return emailSetup;
  }
  const [server, variables, template] = emailSetup;

  if (user.email && user.name) {
    const { from, body, subject } = await generateEmailBody({
      email: user.email,
      username: user.name,
      template: template as Template,
      variables:
        variables && "rows" in variables ? (variables.rows as Variable[]) : [],
      url: "", // a rare case where there is no app url to use
    });
    try {
      await sendEmail({
        body,
        to: user.email,
        from,
        subject,
        url: String(server?.server),
      });
    } catch (e) {
      if (e instanceof Error) {
        warn("Unable to send email", { stack: e.stack, message: e.message });
        return responder(e.message, { status: 400 });
      }
    }
  }
}

export async function sendTenantUserInvite(params: {
  req: Request;
  responder: ResponderFn;
  tenantId: string;
  userId: string;
  json: {
    callbackUrl: string;
    redirectUrl: string | URL;
    identifier: string;
  };
}): Promise<Response> {
  const { json, req, responder, tenantId, userId } = params;
  const token = randomString(32);

  const sql = await queryByReq(req);
  const sqlOne = await queryBySingle({ req, responder });

  // the next query will deal with permission
  const {
    rows: [tenant],
    error: tenantError,
  } = await sqlOne`
    SELECT
      *
    FROM
      public.tenants
    WHERE
      id = ${tenantId}
  `;

  if (tenantError) {
    debug(`missing tenant ${tenantId}`);
    return responder(tenantError);
  }
  // a missing user is ok
  const {
    rows: [user],
  } = await sqlOne`
    SELECT
      *
    FROM
      users.users
    WHERE
      email = ${json.identifier}
  `;

  // check if the user is already in the tenant.
  if (user) {
    const [, person] = await sql`
      ${addContext({ tenantId })};

      SELECT
        *
      FROM
        users.tenant_users
      WHERE
        user_id = ${user.id}
    `;
    if (person && "rowCount" in person && person.rowCount > 0) {
      return responder("User is already a member of the tenant", {
        status: 400,
      });
    }
  }

  const [contextError, , invite] = await sql`
    ${addContext({ tenantId })};

    ${addContext({ userId })};

    INSERT INTO
      auth.invites (tenant_id, token, identifier, created_by, expires)
    VALUES
      (
        ${tenantId},
        ${token},
        ${json.identifier},
        ${userId},
        NOW() + INTERVAL '7 days'
      )
    ON CONFLICT (tenant_id, identifier) DO UPDATE
    SET
      token = EXCLUDED.token,
      expires = NOW() + INTERVAL '7 days'
    RETURNING
      *
  `;
  if (contextError) {
    return handleFailure(responder, contextError as ErrorResultSet);
  }
  const callbackUrl = json.callbackUrl;
  const redirectUrl = json.redirectUrl;
  const validInvite = invite && "rows" in invite ? invite.rows[0] : undefined;
  const searchParams = new URLSearchParams({
    token,
    identifier: json.identifier,
    callbackUrl,
  });

  const setup = await setupEmail({
    req,
    responder,
    template: "invite_user",
  });

  if (setup instanceof Response) {
    return setup;
  }
  const [server, variables, template] = setup;
  const { from, body, subject } = await generateEmailBody({
    email: json.identifier,
    template,
    variables,
    url: `${redirectUrl}?${searchParams.toString()}`,
    tenantName: tenant?.name,
  });

  try {
    await sendEmail({
      body,
      to: json.identifier,
      from,
      subject,
      url: server.server,
    });
  } catch (e) {
    if (e instanceof Error) {
      warn("Unable to send email", { stack: e.stack, message: e.message });
      return responder(e.message, { status: 400 });
    }
  }

  return responder(JSON.stringify(validInvite), { status: 201 });
}

async function setupEmail(params: {
  req: Request;
  responder: ResponderFn;
  template: EmailTemplate;
}): Promise<Response | [{ server: string }, Variable[], Template]> {
  const { req, responder, template } = params;
  const sqlOne = await queryBySingle({ req, responder });
  const sqlMany = await queryByReq(req as Request);
  const [variables] = await sqlMany`
    SELECT
      *
    FROM
      auth.template_variables
  `;
  const [
    {
      rows: [templateString],
      error: templateError,
    },
    {
      rows: [server],
      error: serverError,
    },
  ] = await Promise.all([
    sqlOne`
      SELECT
        *
      FROM
        auth.email_templates
      WHERE
        name = ${template}
    `,
    sqlOne`
      SELECT
        *
      FROM
        auth.email_servers
      ORDER BY
        created DESC
      LIMIT
        1
    `,
  ]);
  if (templateError) {
    return responder(`Unable to find email template ${template}`, {
      status: 404,
    });
  }
  if (serverError) {
    return responder("Email sending is not configured for this database.", {
      status: 400,
    });
  }
  return [
    server as { server: string },
    variables && "rows" in variables ? (variables.rows as Variable[]) : [],
    templateString as Template,
  ];
}

/**
 * This is called from inside NileAuth() , so the "responder" is fake, but necessary to handle internal failures
 * @param params
 * @returns
 */
export async function send2FaEmail(params: {
  req: Request;
  json: {
    email: string;
    name?: string;
    otp: string;
  };
}) {
  const { req, json } = params;
  const [responder] = ResponseLogger(req, EventEnum.MFA);
  const setup = await setupEmail({
    req,
    responder,
    template: "mfa_code",
  });

  if (setup instanceof Response) {
    return setup;
  }
  const [server, variables, template] = setup;
  const { from, body, subject } = await generateEmailBody({
    email: json.email,
    template,
    variables: [...variables, { name: "token", value: json.otp }],
    url: "", // URL should be blank, because this email is just 1 way.
  });

  try {
    await sendEmail({
      body,
      to: json.email,
      from,
      subject,
      url: server.server,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send email";
    warn("Unable to send email", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new EmailError(message, error);
  }
}

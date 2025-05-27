import EmailProvider from "next-auth/providers/email";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { User as NextAuthUser } from "next-auth";

import {
  queryByInfo,
  queryByReq,
  queryBySingle,
  ResultSet,
} from "@nile-auth/query";
import { Logger, ResponderFn } from "@nile-auth/logger";
import { DbCreds } from "@nile-auth/query/getDbInfo";
import { randomString } from "../../utils";
import { findCallbackCookie } from "../cookies";
import { validCsrfToken } from "../csrf";
const { info, warn, debug } = Logger("emailProvider");

export type Variable = { name: string; value?: string };

function isEmpty(row: ResultSet<Record<string, string>[]> | undefined) {
  return row && "rowCount" in row && row.rowCount === 0;
}
export default async function Email(
  creds: DbCreds,
  config?: {
    emailTemplate: "email_invitation" | "password_reset" | "verify_email";
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

      await sendEmail({
        body,
        url: String(server.server),
        to: identifier,
        from: from ? from : initialFrom,
        subject,
      });
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
  | "sender";

export function generateEmailBody(params: {
  email: string;
  username?: string;
  template: void | Template;
  variables: Variable[];
  url: string;
}) {
  const { email, template, username, url } = params;

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

function validSender(
  email: string,
  vars: Variable[],
  template: void | Template,
) {
  const validEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
    email,
  );
  if (!validEmail) {
    info("Attempted to send email with invalid sender", {
      email,
      template_variables: vars,
      template,
    });
  }
  return validEmail;
}

export async function sendVerifyEmail(params: {
  req: Request;
  responder: ResponderFn;
}) {
  const { req, responder } = params;
  const preserve = await req.clone();
  const formData = await preserve.formData();
  const email = String(formData.get("email"));
  const callbackUrl = String(formData.get("resetUrl"));
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
      "Unable to send verification email, the template is missing",
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
        name = 'password_alert'
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
    return responder(templateError);
  }
  if (serverError) {
    return responder(serverError);
  }
  if (user.email && user.name) {
    const { from, body, subject } = await generateEmailBody({
      email: user.email,
      username: user.name,
      template: template as Template,
      variables:
        variables && "rows" in variables ? (variables.rows as Variable[]) : [],
      url: "", // a rare case where there is no app url to use
    });
    await sendEmail({
      body,
      to: user.email,
      from,
      subject,
      url: String(server?.server),
    });
  }
}

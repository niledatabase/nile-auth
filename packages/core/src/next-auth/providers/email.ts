import EmailProvider from "next-auth/providers/email";
import { Provider, ProviderNames } from "../../types";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { queryByInfo, sqlTemplate, TemplateType } from "@nile-auth/query";
import { Logger } from "@nile-auth/logger";
import { Pool } from "pg";
import { DbCreds } from "@nile-auth/query/getDbInfo";
const { error, debug } = Logger("emailProvider");

export default async function Email(provider: Provider, creds: DbCreds) {
  const sql = await queryByInfo(creds);

  const [[servers], [templates]] = await Promise.all([
    sql`
      SELECT
        *
      FROM
        auth.email_servers
      ORDER BY
        created ASC
    `,
    sql`
      SELECT
        *
      FROM
        auth.email_templates
      WHERE
        template = 'email_invitation'
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

  if (!server) {
    throw new Error("No email servers are configured.");
  }
  if (!template) {
    throw new Error(
      "Template for sending email invite is missing from database.",
    );
  }
  // need to only find sender, damn
  const from = replaceVars(String(template.sender), {
    ...(server.variables ?? {}),
    sender: server.variables?.sender ?? "noreply@thenile.dev",
  } as unknown as Record<NileAuthFields, string>);

  return EmailProvider({
    server: server.server,
    from,
    sendVerificationRequest: async function sendVerificationRequest(params) {
      const { identifier, url, provider } = params;

      const { body, subject } = await generateEmailBody({
        email: identifier,
        name: "", // may be we look up the user, but also may just be random garbage
        server: server as unknown as Server,
        template: template as unknown as Template,
        url,
      });
      if (!body) {
        throw new Error("We dead");
      }

      await sendEmail({
        body,
        url: String(server.server),
        to: identifier,
        from,
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
      error(e);
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
  | "password_reset_url"
  | "email_verify_url"
  | "api_url"
  | "user.name"
  | "user.email"
  | "app_name"
  | "sender";

export async function generateEmailBody(params: {
  email: string;
  name: string;
  server: Server;
  template: Template;
  url: string;
}) {
  const { email, name, server, template, url } = params;
  // remove slash if necessary
  const serverVarUrl = server.variables.api_url.endsWith("/")
    ? server.variables.api_url.slice(0, -1)
    : server.variables.api_url;

  let api_url;
  try {
    const localUrl = new URL(url);
    api_url = `${serverVarUrl ?? localUrl.origin.slice(0, -1)}${localUrl.pathname}?${localUrl.searchParams}`;
  } catch (e) {
    // bad url, oh no
  }
  const replacers = {
    ...server.variables,
    "user.name": name,
    "user.email": email,
    app_name: server.variables.app_name,
    sender: server.variables.sender ?? "noreply@thenile.dev",
    api_url,
  };
  const subject = replaceVars(template.subject, replacers);
  const from = replaceVars(String(template.sender), {
    ...(server.variables ?? {}),
    sender: replacers.sender,
  } as unknown as Record<NileAuthFields, string>);
  return { body: replaceVars(template.body, replacers), subject, from };
}

function replaceVars(
  html: string,
  replacers: Record<NileAuthFields, string | undefined>,
) {
  if (!replacers) return html;
  let processedHtml = html;
  for (const [key, value] of Object.entries(replacers)) {
    const placeholder = `\${${key}}`; // Format: ${key}
    if (value) {
      processedHtml = processedHtml.replaceAll(placeholder, value);
    }
  }

  return processedHtml;
}

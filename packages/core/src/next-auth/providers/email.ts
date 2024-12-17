import EmailProvider from "next-auth/providers/email";
import { Provider, ProviderNames } from "../../types";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { query } from "@nile-auth/query";
import { Logger } from "@nile-auth/logger";
import { Pool } from "pg";
const { error } = Logger("emailProvider");

export default function Email(provider: Provider, pool: Pool) {
  const { config } = provider;

  return EmailProvider({
    server: config.server,
    from: config.from,
    sendVerificationRequest: async function sendVerificationRequest(params) {
      // do something
      const { identifier, url, provider } = params;
      try {
        const sql = query(pool);
        const rows = await sql`
          SELECT
            *
          FROM
            auth.oidc_providers
          WHERE
            name = ${ProviderNames.Email}
        `;
        const cfg = rows && "rows" in rows ? rows.rows[0] : null;
        const { html: rawHtml } = cfg.config;
        const html = rawHtml.replace("${url}", url);

        const transportOptions: SMTPTransport.Options = {
          url: String(provider.server),
          to: identifier,
          ...cfg.config,
          html,
        };

        const transport = createTransport(transportOptions);

        const result = await transport.sendMail(transportOptions);

        const failed = result.rejected.concat(result.pending).filter(Boolean);
        if (failed.length) {
          throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
        }
      } catch (e) {
        error(e);
      }
    },
  });
}

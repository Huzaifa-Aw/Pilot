import { Resend } from "resend";
import nodemailer from "nodemailer";

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export function emailConfigurationError() {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";
  const from = provider === "smtp" ? process.env.SMTP_FROM ?? process.env.EMAIL_FROM : process.env.EMAIL_FROM;
  if (!from) return "Set EMAIL_FROM or SMTP_FROM to send invitations.";
  if (provider === "resend" && !process.env.RESEND_API_KEY) {
    return "Set RESEND_API_KEY to send invitations.";
  }
  if (provider === "smtp") {
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!process.env.SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535) {
      return "Set a valid SMTP_HOST and SMTP_PORT to send invitations.";
    }
    if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
      return "Set both SMTP_USER and SMTP_PASS, or leave both empty.";
    }
  } else if (provider !== "resend") {
    return 'EMAIL_PROVIDER must be either "resend" or "smtp".';
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendInvitationEmail({
  recipient,
  organizationName,
  invitationUrl,
  expiresAt,
}: {
  recipient: string;
  organizationName: string;
  invitationUrl: string;
  expiresAt: Date;
}) {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";
  const from = provider === "smtp" ? process.env.SMTP_FROM ?? process.env.EMAIL_FROM : process.env.EMAIL_FROM;
  const configError = emailConfigurationError();
  if (configError) throw new EmailDeliveryError(configError);
  if (!from) throw new EmailDeliveryError("Set EMAIL_FROM or SMTP_FROM to send invitations.");

  const html = `<main><h1>Join ${escapeHtml(organizationName)}</h1><p>You have been invited to join your organization's engineering workspace.</p><p><a href="${escapeHtml(invitationUrl)}">Accept invitation</a></p><p>This invitation expires ${escapeHtml(expiresAt.toISOString())}.</p></main>`;
  try {
    if (provider === "resend") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new EmailDeliveryError("Set RESEND_API_KEY to send invitations.");
      const result = await new Resend(apiKey).emails.send({
        from,
        to: recipient,
        subject: `Invitation to ${organizationName}`,
        html,
      });
      if (result.error) throw new EmailDeliveryError(`Invitation email could not be sent: ${result.error.message}`);
      return;
    }

    if (provider === "smtp") {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT ?? 587);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new EmailDeliveryError("Set a valid SMTP_HOST and SMTP_PORT to send invitations.");
      const username = process.env.SMTP_USER;
      const password = process.env.SMTP_PASS;
      if (Boolean(username) !== Boolean(password)) {
        throw new EmailDeliveryError("Set both SMTP_USER and SMTP_PASS, or leave both empty.");
      }
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        ...(username && password ? { auth: { user: username, pass: password } } : {}),
      });
      await transporter.sendMail({
        from,
        to: recipient,
        subject: `Invitation to ${organizationName}`,
        html,
      });
      return;
    }

    throw new EmailDeliveryError('EMAIL_PROVIDER must be either "resend" or "smtp".');
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError("Invitation email could not be delivered. Check the email provider settings and try again.");
  }
}

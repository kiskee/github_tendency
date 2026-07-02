import nodemailer from "nodemailer";
import { EMAIL_FRONTEND_URL } from "../config/auth.js";

const GOOGLE_HOST = process.env.GOOGLE_HOST || "smtp.gmail.com";
const GOOGLE_PORT = parseInt(process.env.GOOGLE_PORT || "587", 10);
const GOOGLE_USER = process.env.GOOGLE_LONNSOM;
const GOOGLE_PASS = process.env.GOOGLE_PS;
const GOOGLE_PASS2 = process.env.GOOGLE_PS2;
const EMAIL_FROM = process.env.EMAIL_FROM || GOOGLE_USER || "noreply@example.com";

function createTransporter(password: string) {
  return nodemailer.createTransport({
    host: GOOGLE_HOST,
    port: GOOGLE_PORT,
    secure: GOOGLE_PORT === 465,
    auth: {
      user: GOOGLE_USER,
      pass: password,
    },
  });
}

async function sendMail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  if (!GOOGLE_USER || !GOOGLE_PASS) {
    console.log(`[email] Missing GOOGLE_LONNSOM or GOOGLE_PS. Email not sent to ${to}`);
    return;
  }

  const passwords = [GOOGLE_PASS, GOOGLE_PASS2].filter(Boolean) as string[];
  let lastError: unknown;

  for (const password of passwords) {
    const transporter = createTransporter(password);
    try {
      const info = await transporter.sendMail({
        from: EMAIL_FROM,
        to,
        subject,
        html,
        text,
      });
      console.log(`[email] Sent to ${to}. MessageId: ${info.messageId}`);
      return;
    } catch (err) {
      lastError = err;
      console.error(`[email] Failed with password fallback for ${to}:`, err);
    }
  }

  console.error(`[email] All SMTP attempts failed for ${to}:`, lastError);
}

interface EmailTemplateData {
  title: string;
  message: string;
  buttonText: string;
  buttonUrl: string;
  footerNote?: string;
}

function renderEmailTemplate(data: EmailTemplateData): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" style="max-width:480px;background-color:#111827">
          <tr>
            <td style="padding:32px 24px 24px;text-align:center">
              <h1 style="color:#f97316;font-size:22px;font-weight:700;margin:0">GitHub Tendency</h1>
              <h2 style="color:#f3f4f6;font-size:16px;font-weight:600;margin:24px 0 12px">${data.title}</h2>
              <p style="color:#d1d5db;font-size:14px;line-height:1.6;margin:0 0 24px">${data.message}</p>
              <a href="${data.buttonUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#ea580c">${data.buttonText}</a>
              ${data.footerNote ? `<p style="color:#6b7280;font-size:12px;line-height:1.5;margin:24px 0 0">${data.footerNote}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;text-align:center">
              <hr style="border:none;border-top:1px solid #374151;margin:0 0 16px" />
              <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin:0">
                <a href="${EMAIL_FRONTEND_URL}" target="_blank" style="color:#f97316;text-decoration:underline">GitHub Tendency</a>
                &mdash; Real-time GitHub Repository Trends
              </p>
            </td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:11px;margin:16px 0 0;text-align:center">
          Si no solicitaste este correo, ignóralo. No recibirás más mensajes.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function renderPlainText(data: EmailTemplateData): string {
  return `${data.title}

${data.message}

${data.buttonText}: ${data.buttonUrl}

${data.footerNote || ""}

---
GitHub Tendency - ${EMAIL_FRONTEND_URL}`.trim();
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${EMAIL_FRONTEND_URL}/verify-email?token=${token}`;
  const data: EmailTemplateData = {
    title: "Verifica tu cuenta",
    message: "Gracias por registrarte en GitHub Tendency. Haz clic en el botón para verificar tu dirección de correo electrónico.",
    buttonText: "Verificar cuenta",
    buttonUrl: url,
  };
  const html = renderEmailTemplate(data);
  const text = renderPlainText(data);
  await sendMail(to, "Verifica tu cuenta de GitHub Tendency", html, text);
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${EMAIL_FRONTEND_URL}/reset-password?token=${token}`;
  const data: EmailTemplateData = {
    title: "Restablece tu contraseña",
    message: "Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva.",
    buttonText: "Restablecer contraseña",
    buttonUrl: url,
    footerNote: "Si no solicitaste esto, ignora este correo. Tu contraseña actual sigue siendo segura.",
  };
  const html = renderEmailTemplate(data);
  const text = renderPlainText(data);
  await sendMail(to, "Restablece tu contraseña - GitHub Tendency", html, text);
}

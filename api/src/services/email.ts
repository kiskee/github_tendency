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

const LOGO_SVG = `<svg viewBox="0 0 24 24" width="40" height="40" fill="#f97316" style="display:block;margin:0 auto"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>`;

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
  <title>${data.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0200;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0200">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" width="100%" style="max-width:480px;background-color:#111827;border-radius:16px;border:1px solid rgba(255,255,255,0.06)">
          <tr>
            <td style="padding:40px 32px 32px;text-align:center">
              ${LOGO_SVG}
              <h1 style="color:#f97316;font-size:20px;font-weight:700;margin:16px 0 0;letter-spacing:-0.3px">GitHub Tendency</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;text-align:center">
              <h2 style="color:#f3f4f6;font-size:18px;font-weight:600;margin:0 0 12px">${data.title}</h2>
              <p style="color:#d1d5db;font-size:14px;line-height:1.6;margin:0 0 24px">${data.message}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto">
                <tr>
                  <td align="center" style="background-color:#ea580c;border-radius:12px;padding:0">
                    <a href="${data.buttonUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;background-color:#ea580c">${data.buttonText}</a>
                  </td>
                </tr>
              </table>
              ${data.footerNote ? `<p style="color:#6b7280;font-size:12px;line-height:1.5;margin:24px 0 0">${data.footerNote}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px">
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 24px" />
              <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin:0;text-align:center">
                &copy; ${new Date().getFullYear()} GitHub Tendency &mdash; Real-time GitHub Repository Trends
                <br />
                <a href="${EMAIL_FRONTEND_URL}" target="_blank" style="color:#f97316;text-decoration:underline">${EMAIL_FRONTEND_URL}</a>
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

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${EMAIL_FRONTEND_URL}/verify-email?token=${token}`;
  const html = renderEmailTemplate({
    title: "Verifica tu cuenta",
    message: "Gracias por registrarte en GitHub Tendency. Haz clic en el botón para verificar tu dirección de correo electrónico.",
    buttonText: "Verificar cuenta",
    buttonUrl: url,
  });
  await sendMail(to, "Verifica tu cuenta de GitHub Tendency", html);
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${EMAIL_FRONTEND_URL}/reset-password?token=${token}`;
  const html = renderEmailTemplate({
    title: "Restablece tu contraseña",
    message: "Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva.",
    buttonText: "Restablecer contraseña",
    buttonUrl: url,
    footerNote: "Si no solicitaste esto, ignora este correo. Tu contraseña actual sigue siendo segura.",
  });
  await sendMail(to, "Restablece tu contraseña - GitHub Tendency", html);
}

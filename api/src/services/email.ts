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

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${EMAIL_FRONTEND_URL}/verify-email?token=${token}`;
  await sendMail(
    to,
    "Verifica tu cuenta de GitHub Trends",
    `<p>Haz clic en el siguiente enlace para verificar tu cuenta:</p><p><a href="${url}">${url}</a></p>`,
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${EMAIL_FRONTEND_URL}/reset-password?token=${token}`;
  await sendMail(
    to,
    "Restablece tu contraseña",
    `<p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p><p><a href="${url}">${url}</a></p><p>Si no solicitaste esto, ignora este correo.</p>`,
  );
}

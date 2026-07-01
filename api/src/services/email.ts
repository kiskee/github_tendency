import { Resend } from "resend";
import { FRONTEND_URL } from "../config/auth.js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${FRONTEND_URL}/verify-email?token=${token}`;

  if (!resend) {
    console.log(`[email] No RESEND_API_KEY. Verification link for ${to}: ${url}`);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: "Verifica tu cuenta de GitHub Trends",
      html: `<p>Haz clic en el siguiente enlace para verificar tu cuenta:</p><p><a href="${url}">${url}</a></p>`,
    });

    if (error) {
      console.error(`[email] Resend error sending to ${to}:`, error);
    } else {
      console.log(`[email] Verification email sent to ${to}. Id:`, data?.id);
    }
  } catch (err) {
    console.error(`[email] Failed to send verification email to ${to}:`, err);
  }
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${FRONTEND_URL}/reset-password?token=${token}`;

  if (!resend) {
    console.log(`[email] No RESEND_API_KEY. Password reset link for ${to}: ${url}`);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: "Restablece tu contraseña",
      html: `<p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p><p><a href="${url}">${url}</a></p><p>Si no solicitaste esto, ignora este correo.</p>`,
    });

    if (error) {
      console.error(`[email] Resend error sending to ${to}:`, error);
    } else {
      console.log(`[email] Password reset email sent to ${to}. Id:`, data?.id);
    }
  } catch (err) {
    console.error(`[email] Failed to send password reset email to ${to}:`, err);
  }
}

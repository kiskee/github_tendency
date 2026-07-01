import jwt from "jsonwebtoken";
import { pool } from "./database.js";
import {
  comparePassword,
  hashPassword,
  hashToken,
  randomToken,
} from "../utils/crypto.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./email.js";
import {
  JWT_ACCESS_EXPIRES_IN,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_EXPIRES_IN,
  JWT_REFRESH_SECRET,
} from "../config/auth.js";

export interface User {
  id: number;
  email: string;
  role: string;
  email_verified: boolean;
  created_at: Date;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  success: boolean;
  error?: string;
  user?: User;
  tokens?: Tokens;
}

function expiresInToMs(expiresIn: string): number {
  const unit = expiresIn.slice(-1);
  const value = parseInt(expiresIn.slice(0, -1), 10);
  if (isNaN(value)) return 0;
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return value;
  }
}

function generateTokens(userId: number, role: string): Tokens {
  const accessToken = jwt.sign({ userId, role }, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN as any,
  });
  const refreshToken = jwt.sign(
    { userId, type: "refresh" },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as any },
  );
  return { accessToken, refreshToken };
}

async function storeRefreshToken(
  userId: number,
  refreshToken: string,
): Promise<void> {
  const hash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + expiresInToMs(JWT_REFRESH_EXPIRES_IN));
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );
}

export async function registerUser(
  email: string,
  password: string,
): Promise<AuthResult> {
  const existing = await pool.query<User>(
    `SELECT id, email, role, email_verified, created_at FROM users WHERE email = $1`,
    [email],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return { success: false, error: "Email already registered" };
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = randomToken();

  const result = await pool.query<User>(
    `INSERT INTO users (email, password_hash, verification_token)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, email_verified, created_at`,
    [email, passwordHash, verificationToken],
  );

  const user = result.rows[0];
  await sendVerificationEmail(user.email, verificationToken);

  return { success: true, user };
}

export async function verifyEmail(token: string): Promise<AuthResult> {
  const result = await pool.query<User>(
    `UPDATE users
     SET email_verified = true, verification_token = NULL
     WHERE verification_token = $1
     RETURNING id, email, role, email_verified, created_at`,
    [token],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { success: false, error: "Invalid or expired verification token" };
  }

  return { success: true, user: result.rows[0] };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResult> {
  const result = await pool.query<User>(
    `SELECT id, email, role, email_verified, created_at, password_hash FROM users WHERE email = $1`,
    [email],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { success: false, error: "Invalid credentials" };
  }

  const userRow = result.rows[0];
  const passwordHash = (userRow as any).password_hash as string;
  const valid = await comparePassword(password, passwordHash);
  if (!valid) {
    return { success: false, error: "Invalid credentials" };
  }

  if (!userRow.email_verified) {
    return { success: false, error: "Email not verified" };
  }

  const tokens = generateTokens(userRow.id, userRow.role);
  await storeRefreshToken(userRow.id, tokens.refreshToken);

  const { password_hash, ...user } = userRow as any;
  return { success: true, user, tokens };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthResult> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    return { success: false, error: "Invalid refresh token" };
  }

  if (payload.type !== "refresh" || !payload.userId) {
    return { success: false, error: "Invalid refresh token" };
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await pool.query<{ user_id: number; expires_at: Date }>(
    `SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );

  if (!stored.rowCount || stored.rowCount === 0) {
    return { success: false, error: "Refresh token not found" };
  }

  if (new Date(stored.rows[0].expires_at) < new Date()) {
    await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [
      tokenHash,
    ]);
    return { success: false, error: "Refresh token expired" };
  }

  const userId = stored.rows[0].user_id;
  const userResult = await pool.query<User>(
    `SELECT id, email, role, email_verified, created_at FROM users WHERE id = $1`,
    [userId],
  );

  if (!userResult.rowCount || userResult.rowCount === 0) {
    return { success: false, error: "User not found" };
  }

  // Rotate refresh token
  await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [
    tokenHash,
  ]);

  const tokens = generateTokens(userResult.rows[0].id, userResult.rows[0].role);
  await storeRefreshToken(userResult.rows[0].id, tokens.refreshToken);

  return { success: true, user: userResult.rows[0], tokens };
}

export async function logoutUser(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [
    tokenHash,
  ]);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );

  // Don't reveal whether email exists
  if (!user.rowCount || user.rowCount === 0) {
    return;
  }

  const resetToken = randomToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
    [resetToken, expiresAt, user.rows[0].id],
  );

  await sendPasswordResetEmail(email, resetToken);
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<AuthResult> {
  const result = await pool.query<{ id: number }>(
    `SELECT id FROM users
     WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
    [token],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { success: false, error: "Invalid or expired reset token" };
  }

  const passwordHash = await hashPassword(password);
  const userResult = await pool.query<User>(
    `UPDATE users
     SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
     WHERE id = $2
     RETURNING id, email, role, email_verified, created_at`,
    [passwordHash, result.rows[0].id],
  );

  // Invalidate all refresh tokens after password change
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [
    result.rows[0].id,
  ]);

  return { success: true, user: userResult.rows[0] };
}

export async function getUserById(id: number): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, email, role, email_verified, created_at FROM users WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

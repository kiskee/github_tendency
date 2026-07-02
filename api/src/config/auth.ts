export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
export const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
export const EMAIL_FRONTEND_URL = process.env.EMAIL_FRONTEND_URL || FRONTEND_URL;
export const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  console.error("Error: JWT_ACCESS_SECRET y JWT_REFRESH_SECRET son requeridos");
  process.exit(1);
}

export const ACCESS_COOKIE_NAME = "access_token";
export const REFRESH_COOKIE_NAME = "refresh_token";

export const cookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "strict" as const,
  path: "/",
};

import { Router, Request, Response } from "express";
import {
  registerSchema,
  loginSchema,
  tokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.js";
import {
  registerUser,
  verifyEmail,
  loginUser,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
} from "../services/auth.js";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  cookieOptions,
} from "../config/auth.js";

const router = Router();

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, cookieOptions);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, cookieOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
}

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0].message });
    return;
  }

  const { email, password, name, phone, company, country } = parse.data;
  const result = await registerUser(email, password, name, phone, company, country);

  if (!result.success) {
    res.status(409).json({ error: result.error });
    return;
  }

  res.status(201).json({ message: "User registered. Check your email to verify your account." });
});

router.get("/verify-email", async (req: Request, res: Response): Promise<void> => {
  const parse = tokenSchema.safeParse({ token: req.query.token });
  if (!parse.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const result = await verifyEmail(parse.data.token);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(200).json({ message: "Email verified successfully" });
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0].message });
    return;
  }

  const result = await loginUser(parse.data.email, parse.data.password);
  if (!result.success || !result.tokens) {
    res.status(401).json({ error: result.error });
    return;
  }

  setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
  res.status(200).json({ user: result.user });
});

router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;
  if (!refreshToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const result = await refreshAccessToken(refreshToken);
  if (!result.success || !result.tokens) {
    clearAuthCookies(res);
    res.status(401).json({ error: result.error });
    return;
  }

  setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
  res.status(200).json({ user: result.user });
});

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;
  if (refreshToken) {
    await logoutUser(refreshToken);
  }
  clearAuthCookies(res);
  res.status(200).json({ message: "Logged out" });
});

router.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const parse = forgotPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0].message });
    return;
  }

  await forgotPassword(parse.data.email);
  res.status(200).json({ message: "If the email exists, a reset link has been sent" });
});

router.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
  const parse = resetPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0].message });
    return;
  }

  const result = await resetPassword(parse.data.token, parse.data.password);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(200).json({ message: "Password reset successfully" });
});

export default router;

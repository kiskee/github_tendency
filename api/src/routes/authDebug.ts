import { Router, Request, Response } from "express";
import { pool } from "../services/database.js";

const router = Router();

router.get("/tokens", async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV !== "development") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { email } = req.query;
  if (typeof email !== "string" || !email) {
    res.status(400).json({ error: "Email required" });
    return;
  }

  const result = await pool.query(
    `SELECT verification_token, password_reset_token, password_reset_expires FROM users WHERE email = $1`,
    [email],
  );

  if (!result.rowCount || result.rowCount === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({
    email,
    verification_token: result.rows[0].verification_token,
    password_reset_token: result.rows[0].password_reset_token,
    password_reset_expires: result.rows[0].password_reset_expires,
  });
});

export default router;

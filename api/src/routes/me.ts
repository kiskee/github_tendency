import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserById } from "../services/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await getUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({ user });
});

export default router;

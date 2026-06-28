import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

export default router;
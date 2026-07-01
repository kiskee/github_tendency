import { Router, Request, Response } from "express";
import { searchGitHubRepos } from "../services/github.js";

const router = Router();

router.get("/:keyword", async (req: Request, res: Response): Promise<void> => {
  const { keyword } = req.params;
  const { first } = req.query;

  if (typeof keyword !== "string" || !keyword) {
    res.status(400).json({ error: "Valid keyword is required" });
    return;
  }

  const firstNum = first && typeof first === "string" ? parseInt(first, 10) : 10;
  if (isNaN(firstNum) || firstNum < 1 || firstNum > 100) {
    res.status(400).json({ error: "first must be between 1 and 100" });
    return;
  }

  const results = await searchGitHubRepos(keyword, undefined, firstNum);

  if (!results) {
    res.status(500).json({ error: "Failed to search GitHub" });
    return;
  }

  res.status(200).json(results);
});

export default router;
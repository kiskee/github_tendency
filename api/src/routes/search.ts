import { Router, Request, Response } from "express";
import { searchGitHubRepos } from "../services/github.js";

const router = Router();

router.get("/:keyword", async (req: Request, res: Response): Promise<void> => {
  const { keyword } = req.params;

  if (typeof keyword !== "string" || !keyword) {
    res.status(400).json({ error: "Valid keyword is required" });
    return;
  }

  const results = await searchGitHubRepos(keyword);

  if (!results) {
    res.status(500).json({ error: "Failed to search GitHub" });
    return;
  }

  res.status(200).json(results);
});

export default router;
import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserById } from "../services/auth.js";
import {
  saveUserGithubToken,
  getUserGithubToken,
  addUserRepository,
  getUserRepositories,
  removeUserRepository,
  getRepositoryHistory,
  getUserRepositoryCommits,
} from "../services/userRepos.js";
import { fetchAndStoreCommits } from "../services/commits.js";
import { pool } from "../services/database.js";
import { z } from "zod";

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

const tokenSchema = z.object({
  token: z.string().min(1, "Token required"),
});

router.post("/github-token", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parse = tokenSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0].message });
    return;
  }

  try {
    await saveUserGithubToken(req.user.userId, parse.data.token);
    res.status(200).json({ message: "GitHub token saved" });
  } catch (error) {
    console.error("[me] Failed to save GitHub token:", error);
    res.status(500).json({ error: "Failed to save token" });
  }
});

router.get("/github-token", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const token = await getUserGithubToken(req.user.userId);
    res.status(200).json({ hasToken: !!token, token: token ? `${token.slice(0, 4)}...${token.slice(-4)}` : null });
  } catch (error) {
    console.error("[me] Failed to read GitHub token:", error);
    res.status(500).json({ error: "Failed to read token" });
  }
});

const addRepoSchema = z.object({
  fullName: z.string().regex(/^[^/]+\/[^/]+$/, "Use format owner/repo"),
});

router.get("/repos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const repos = await getUserRepositories(req.user.userId);
    res.status(200).json({ data: repos });
  } catch (error) {
    console.error("[me] Failed to get repositories:", error);
    res.status(500).json({ error: "Failed to get repositories" });
  }
});

router.post("/repos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parse = addRepoSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0].message });
    return;
  }

  try {
    const repo = await addUserRepository(req.user.userId, parse.data.fullName);
    res.status(201).json(repo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add repository";
    console.error("[me] Failed to add repository:", error);
    res.status(400).json({ error: message });
  }
});

router.delete("/repos/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) {
    res.status(400).json({ error: "Invalid repository id" });
    return;
  }

  try {
    await removeUserRepository(req.user.userId, userRepoId);
    res.status(200).json({ message: "Repository removed" });
  } catch (error) {
    console.error("[me] Failed to remove repository:", error);
    res.status(500).json({ error: "Failed to remove repository" });
  }
});

router.get("/repos/:id/history", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) {
    res.status(400).json({ error: "Invalid repository id" });
    return;
  }

  try {
    const history = await getRepositoryHistory(req.user.userId, userRepoId);
    res.status(200).json({ data: history });
  } catch (error) {
    console.error("[me] Failed to get repository history:", error);
    res.status(500).json({ error: "Failed to get repository history" });
  }
});

router.post("/repos/:id/refresh-commits", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) {
    res.status(400).json({ error: "Invalid repository id" });
    return;
  }

  try {
    const token = await getUserGithubToken(req.user.userId);
    if (!token) {
      res.status(400).json({ error: "GitHub token not configured" });
      return;
    }

    const repoCheck = await pool.query(
      `SELECT ur.repository_id, ur.full_name 
       FROM user_repositories ur
       WHERE ur.id = $1 AND ur.user_id = $2`,
      [userRepoId, req.user.userId]
    );

    if (repoCheck.rowCount === 0) {
      res.status(404).json({ error: "Repository not found" });
      return;
    }

    const repositoryId = repoCheck.rows[0].repository_id;
    const fullName = repoCheck.rows[0].full_name;
    const [owner, name] = fullName.split('/');

    const commits = await fetchAndStoreCommits(repositoryId, owner, name, token, 10);
    res.status(200).json({ message: `Refreshed ${commits.length} commits`, commits });
  } catch (error) {
    console.error("[me] Failed to refresh commits:", error);
    res.status(500).json({ error: "Failed to refresh commits" });
  }
});

router.get("/repos/:id/commits", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) {
    res.status(400).json({ error: "Invalid repository id" });
    return;
  }

  const limit = parseInt(req.query.limit as string, 10) || 10;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  try {
    const { commits, total } = await getUserRepositoryCommits(
      req.user.userId,
      userRepoId,
      limit,
      offset
    );
    res.status(200).json({ data: commits, total, limit, offset });
  } catch (error) {
    console.error("[me] Failed to get repository commits:", error);
    res.status(500).json({ error: "Failed to get repository commits" });
  }
});

export default router;

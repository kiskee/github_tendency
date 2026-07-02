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
import { fetchAndStoreAllRepoData, getRepositoryPRs, getRepositoryIssues, getRepositoryBranches, getRepositoryReleases, getActivitySummary } from "../services/repoData.js";
import { pool } from "../services/database.js";
import { getCached, setCache, cacheKey, invalidatePattern, invalidateKey } from "../services/redis.js";
import { z } from "zod";

const router = Router();

// Helper to get scan history
async function getScanHistory(repositoryId: number, limit: number = 20, offset: number = 0): Promise<{ scans: any[]; total: number }> {
  const countResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM repo_scan_history WHERE repository_id = $1`,
    [repositoryId]
  );
  const total = countResult.rows[0].count;

  const result = await pool.query(
    `SELECT * FROM repo_scan_history WHERE repository_id = $1 ORDER BY scanned_at DESC LIMIT $2 OFFSET $3`,
    [repositoryId, limit, offset]
  );
  return { scans: result.rows, total };
}

// Helper to verify repo ownership
async function verifyRepoOwnership(userId: number, userRepoId: number): Promise<number | null> {
  const repoCheck = await pool.query(
    `SELECT repository_id FROM user_repositories WHERE id = $1 AND user_id = $2`,
    [userRepoId, userId]
  );
  if (repoCheck.rowCount === 0) return null;
  return repoCheck.rows[0].repository_id;
}

const tokenSchema = z.object({
  token: z.string().min(1, "Token required"),
});

const addRepoSchema = z.object({
  fullName: z.string().regex(/^[^/]+\/[^/]+$/, "Use format owner/repo"),
});

// ============================================
// GET Routes (with cache)
// ============================================

// GET /me
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const key = cacheKey("me", "user", req.user.userId);
  const cached = await getCached(key);
  if (cached) { res.status(200).json(cached); return; }

  const user = await getUserById(req.user.userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const body = { user };
  await setCache(key, body);
  res.status(200).json(body);
});

// GET /me/github-token
router.get("/github-token", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const key = cacheKey("me", "token", req.user.userId);
  const cached = await getCached(key);
  if (cached) { res.status(200).json(cached); return; }

  try {
    const token = await getUserGithubToken(req.user.userId);
    const body = { hasToken: !!token, token: token ? `${token.slice(0, 4)}...${token.slice(-4)}` : null };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to read GitHub token:", error);
    res.status(500).json({ error: "Failed to read token" });
  }
});

// GET /me/repos
router.get("/repos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const key = cacheKey("me", "repos", req.user.userId);
  const cached = await getCached(key);
  if (cached) { res.status(200).json(cached); return; }

  try {
    const repos = await getUserRepositories(req.user.userId);
    const body = { data: repos };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get repositories:", error);
    res.status(500).json({ error: "Failed to get repositories" });
  }
});

// GET /me/repos/:id/history
router.get("/repos/:id/history", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid repository id" }); return; }

  const key = cacheKey("me", "history", req.user.userId, userRepoId);
  const cached = await getCached(key);
  if (cached) { res.status(200).json(cached); return; }

  try {
    const history = await getRepositoryHistory(req.user.userId, userRepoId);
    const body = { data: history };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get repository history:", error);
    res.status(500).json({ error: "Failed to get repository history" });
  }
});

// GET /me/repos/:id/commits
router.get("/repos/:id/commits", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid repository id" }); return; }

  const limit = parseInt(req.query.limit as string, 10) || 10;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  const key = cacheKey("me", "commits", req.user.userId, userRepoId, limit, offset);
  const cached = await getCached(key);
  if (cached) { res.status(200).json(cached); return; }

  try {
    const { commits, total } = await getUserRepositoryCommits(req.user.userId, userRepoId, limit, offset);
    const body = { data: commits, total, limit, offset };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get repository commits:", error);
    res.status(500).json({ error: "Failed to get repository commits" });
  }
});

// GET /me/repos/:id/prs
router.get("/repos/:id/prs", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const repositoryId = await verifyRepoOwnership(req.user.userId, userRepoId);
    if (!repositoryId) { res.status(404).json({ error: "Not found" }); return; }

    const state = req.query.state as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const key = cacheKey("me", "prs", req.user.userId, userRepoId, state || "all", limit, offset);
    const cached = await getCached(key);
    if (cached) { res.status(200).json(cached); return; }

    const { prs, total } = await getRepositoryPRs(repositoryId, state, limit, offset);
    const body = { data: prs, total, limit, offset };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get PRs:", error);
    res.status(500).json({ error: "Failed to get PRs" });
  }
});

// GET /me/repos/:id/issues
router.get("/repos/:id/issues", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const repositoryId = await verifyRepoOwnership(req.user.userId, userRepoId);
    if (!repositoryId) { res.status(404).json({ error: "Not found" }); return; }

    const state = req.query.state as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const key = cacheKey("me", "issues", req.user.userId, userRepoId, state || "all", limit, offset);
    const cached = await getCached(key);
    if (cached) { res.status(200).json(cached); return; }

    const { issues, total } = await getRepositoryIssues(repositoryId, state, limit, offset);
    const body = { data: issues, total, limit, offset };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get issues:", error);
    res.status(500).json({ error: "Failed to get issues" });
  }
});

// GET /me/repos/:id/branches
router.get("/repos/:id/branches", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const repositoryId = await verifyRepoOwnership(req.user.userId, userRepoId);
    if (!repositoryId) { res.status(404).json({ error: "Not found" }); return; }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const key = cacheKey("me", "branches", req.user.userId, userRepoId);
    const cached = await getCached(key);
    if (cached) { res.status(200).json(cached); return; }

    const { branches, total } = await getRepositoryBranches(repositoryId, limit, offset);
    const body = { data: branches, total, limit, offset };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get branches:", error);
    res.status(500).json({ error: "Failed to get branches" });
  }
});

// GET /me/repos/:id/releases
router.get("/repos/:id/releases", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const repositoryId = await verifyRepoOwnership(req.user.userId, userRepoId);
    if (!repositoryId) { res.status(404).json({ error: "Not found" }); return; }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const key = cacheKey("me", "releases", req.user.userId, userRepoId);
    const cached = await getCached(key);
    if (cached) { res.status(200).json(cached); return; }

    const { releases, total } = await getRepositoryReleases(repositoryId, limit, offset);
    const body = { data: releases, total, limit, offset };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get releases:", error);
    res.status(500).json({ error: "Failed to get releases" });
  }
});

// GET /me/repos/:id/activity
router.get("/repos/:id/activity", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const repositoryId = await verifyRepoOwnership(req.user.userId, userRepoId);
    if (!repositoryId) { res.status(404).json({ error: "Not found" }); return; }

    const key = cacheKey("me", "activity", req.user.userId, userRepoId);
    const cached = await getCached(key);
    if (cached) { res.status(200).json(cached); return; }

    const summary = await getActivitySummary(repositoryId);
    await setCache(key, summary);
    res.status(200).json(summary);
  } catch (error) {
    console.error("[me] Failed to get activity summary:", error);
    res.status(500).json({ error: "Failed to get activity summary" });
  }
});

// GET /me/repos/:id/scan-history
router.get("/repos/:id/scan-history", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const repositoryId = await verifyRepoOwnership(req.user.userId, userRepoId);
    if (!repositoryId) { res.status(404).json({ error: "Not found" }); return; }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const key = cacheKey("me", "scan", req.user.userId, userRepoId, limit, offset);
    const cached = await getCached(key);
    if (cached) { res.status(200).json(cached); return; }

    const { scans, total } = await getScanHistory(repositoryId, limit, offset);
    const body = { data: scans, total, limit, offset };
    await setCache(key, body);
    res.status(200).json(body);
  } catch (error) {
    console.error("[me] Failed to get scan history:", error);
    res.status(500).json({ error: "Failed to get scan history" });
  }
});

// ============================================
// POST/DELETE Routes (with cache invalidation)
// ============================================

// POST /me/github-token
router.post("/github-token", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = tokenSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.issues[0].message }); return; }

  try {
    await saveUserGithubToken(req.user.userId, parse.data.token);
    await invalidateKey(cacheKey("me", "token", req.user.userId));
    res.status(200).json({ message: "GitHub token saved" });
  } catch (error) {
    console.error("[me] Failed to save GitHub token:", error);
    res.status(500).json({ error: "Failed to save token" });
  }
});

// POST /me/repos
router.post("/repos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = addRepoSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.issues[0].message }); return; }

  try {
    const repo = await addUserRepository(req.user.userId, parse.data.fullName);
    await invalidateKey(cacheKey("me", "repos", req.user.userId));
    res.status(201).json(repo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add repository";
    console.error("[me] Failed to add repository:", error);
    res.status(400).json({ error: message });
  }
});

// DELETE /me/repos/:id
router.delete("/repos/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid repository id" }); return; }

  try {
    await removeUserRepository(req.user.userId, userRepoId);
    await invalidateKey(cacheKey("me", "repos", req.user.userId));
    res.status(200).json({ message: "Repository removed" });
  } catch (error) {
    console.error("[me] Failed to remove repository:", error);
    res.status(500).json({ error: "Failed to remove repository" });
  }
});

// POST /me/repos/:id/refresh-commits
router.post("/repos/:id/refresh-commits", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid repository id" }); return; }

  try {
    const token = await getUserGithubToken(req.user.userId);
    if (!token) { res.status(400).json({ error: "GitHub token not configured" }); return; }

    const repoCheck = await pool.query(
      `SELECT ur.repository_id, ur.full_name FROM user_repositories ur WHERE ur.id = $1 AND ur.user_id = $2`,
      [userRepoId, req.user.userId]
    );
    if (repoCheck.rowCount === 0) { res.status(404).json({ error: "Repository not found" }); return; }

    const repositoryId = repoCheck.rows[0].repository_id;
    const fullName = repoCheck.rows[0].full_name;
    const [owner, name] = fullName.split('/');

    const commits = await fetchAndStoreCommits(repositoryId, owner, name, token, 10);

    // Invalidate commits cache for this repo
    await invalidatePattern(cacheKey("me", "commits", req.user.userId, userRepoId, "*"));

    res.status(200).json({ message: `Refreshed ${commits.length} commits`, commits });
  } catch (error) {
    console.error("[me] Failed to refresh commits:", error);
    res.status(500).json({ error: "Failed to refresh commits" });
  }
});

// POST /me/repos/:id/refresh-all
router.post("/repos/:id/refresh-all", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userRepoId = parseInt(req.params.id, 10);
  if (isNaN(userRepoId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const token = await getUserGithubToken(req.user.userId);
    if (!token) { res.status(400).json({ error: "GitHub token not configured" }); return; }

    const repoCheck = await pool.query(
      `SELECT ur.repository_id, ur.full_name FROM user_repositories ur WHERE ur.id = $1 AND ur.user_id = $2`,
      [userRepoId, req.user.userId]
    );
    if (repoCheck.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }

    const repositoryId = repoCheck.rows[0].repository_id;
    const fullName = repoCheck.rows[0].full_name;
    const [owner, name] = fullName.split('/');

    const summary = await fetchAndStoreAllRepoData(repositoryId, owner, name, token);
    await fetchAndStoreCommits(repositoryId, owner, name, token, 10);

    // Invalidate ALL caches for this user and repo
    await invalidatePattern(cacheKey("me", "repos", req.user.userId, "*"));
    await invalidatePattern(cacheKey("me", "commits", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "prs", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "issues", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "branches", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "releases", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "activity", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "scan", req.user.userId, userRepoId, "*"));
    await invalidatePattern(cacheKey("me", "history", req.user.userId, userRepoId, "*"));

    res.status(200).json({ message: "All data refreshed", activity: summary });
  } catch (error) {
    console.error("[me] Failed to refresh all:", error);
    res.status(500).json({ error: "Failed to refresh all data" });
  }
});

export default router;

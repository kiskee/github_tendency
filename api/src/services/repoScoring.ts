import { pool } from "./database.js";
import { type GitHubRepo } from "./github.js";

export async function saveSnapshot(repoId: number, repo: GitHubRepo): Promise<void> {
  await pool.query(
    `INSERT INTO repository_snapshots (repository_id, stars, forks, open_issues, collected_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [repoId, repo.stars, repo.forks, repo.openIssues],
  );
}

export async function getSnapshotStars(repoId: number, hours: number): Promise<number | null> {
  const result = await pool.query<{ stars: number }>(
    `SELECT stars FROM repository_snapshots
     WHERE repository_id = $1 AND collected_at <= NOW() - INTERVAL '${hours} hours'
     ORDER BY collected_at DESC
     LIMIT 1`,
    [repoId],
  );
  return result.rows[0]?.stars ?? null;
}

export function computeScore(repo: GitHubRepo, stars24h: number, stars7d: number): number {
  const daysSincePush = repo.lastPush
    ? (Date.now() - new Date(repo.lastPush).getTime()) / 86400000
    : 365;
  const recency = Math.max(0, 100 - daysSincePush);
  const growth = stars24h * 10 + stars7d * 2;
  const base = Math.log10(repo.stars + 1) * 50;
  const engagement = (repo.forks / Math.max(repo.stars, 1)) * 200;
  return Number((growth + base + recency + engagement).toFixed(2));
}

export async function updateRepoScores(repoId: number, repo: GitHubRepo): Promise<void> {
  const stars24hBase = await getSnapshotStars(repoId, 24);
  const stars7dBase = await getSnapshotStars(repoId, 168);
  const stars24h = stars24hBase !== null ? Math.max(0, repo.stars - stars24hBase) : 0;
  const stars7d = stars7dBase !== null ? Math.max(0, repo.stars - stars7dBase) : 0;
  const score = computeScore(repo, stars24h, stars7d);
  await pool.query(
    `UPDATE repositories SET stars_24h = $1, stars_7d = $2, score = $3 WHERE id = $4`,
    [stars24h, stars7d, score, repoId],
  );
}

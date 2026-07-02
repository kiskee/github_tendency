import { pool } from "./database.js";
import { getGitHubRepository, type GitHubRepo } from "./github.js";
import { encryptToken, decryptToken } from "../utils/tokenCrypto.js";
import { saveSnapshot, updateRepoScores } from "./repoScoring.js";

export interface UserRepository {
  id: number;
  fullName: string;
  isActive: boolean;
  addedAt: string;
  repository: {
    id: number;
    githubId: number;
    name: string;
    fullName: string;
    owner: string;
    description: string;
    url: string;
    stars: number;
    forks: number;
    language: string;
    stars24h: number;
    stars7d: number;
    score: number;
    lastPush: string;
  };
}

export async function saveUserGithubToken(userId: number, token: string): Promise<void> {
  const encrypted = encryptToken(token);
  await pool.query(
    `UPDATE users SET github_token_encrypted = $1 WHERE id = $2`,
    [encrypted, userId],
  );
}

export async function getUserGithubToken(userId: number): Promise<string | null> {
  const result = await pool.query<{ github_token_encrypted: string }>(
    `SELECT github_token_encrypted FROM users WHERE id = $1`,
    [userId],
  );
  const encrypted = result.rows[0]?.github_token_encrypted;
  if (!encrypted) return null;
  return decryptToken(encrypted);
}

async function upsertRepository(repo: GitHubRepo): Promise<number> {
  const repoRes = await pool.query<{ id: number }>(
    `INSERT INTO repositories (github_id, name, full_name, description, url, owner, stars, forks, watchers, open_issues, license, latest_release, languages, topics, homepage_url, is_archived, disk_usage, language, created_at, pushed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT (github_id) DO UPDATE
     SET stars = EXCLUDED.stars,
         forks = EXCLUDED.forks,
         watchers = EXCLUDED.watchers,
         open_issues = EXCLUDED.open_issues,
         license = EXCLUDED.license,
         latest_release = EXCLUDED.latest_release,
         languages = EXCLUDED.languages,
         topics = EXCLUDED.topics,
         homepage_url = EXCLUDED.homepage_url,
         is_archived = EXCLUDED.is_archived,
         disk_usage = EXCLUDED.disk_usage,
         description = EXCLUDED.description,
         pushed_at = EXCLUDED.pushed_at,
         collected_at = NOW()
     RETURNING id`,
    [
      repo.githubId, repo.name, repo.fullName,
      repo.description, repo.url, repo.owner,
      repo.stars, repo.forks, repo.watchers,
      repo.openIssues, repo.license, repo.latestRelease,
      JSON.stringify(repo.languages), JSON.stringify(repo.topics),
      repo.homepageUrl, repo.isArchived, repo.diskUsage,
      repo.language, repo.createdAt, repo.lastPush,
    ],
  );
  return repoRes.rows[0].id;
}

export async function addUserRepository(userId: number, fullName: string): Promise<UserRepository> {
  const token = await getUserGithubToken(userId);
  if (!token) {
    throw new Error("GitHub token not configured. Add it in settings first.");
  }

  const userRes = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  const role = userRes.rows[0]?.role || "user";

  if (role !== "admin") {
    const countRes = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM user_repositories WHERE user_id = $1 AND is_active = true`,
      [userId],
    );
    if (countRes.rows[0].count >= 1) {
      throw new Error("Free users can only track 1 repository. Upgrade to add more.");
    }
  }

  const repo = await getGitHubRepository(fullName, token);
  if (!repo) {
    throw new Error("Repository not found or GitHub API error");
  }

  const repoId = await upsertRepository(repo);
  await saveSnapshot(repoId, repo);
  await updateRepoScores(repoId, repo);

  const linkRes = await pool.query<{ id: number }>(
    `INSERT INTO user_repositories (user_id, repository_id, full_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, repository_id) DO UPDATE
     SET is_active = true
     RETURNING id`,
    [userId, repoId, repo.fullName],
  );

  return getUserRepositoryById(userId, linkRes.rows[0].id);
}

export async function getUserRepositories(userId: number): Promise<UserRepository[]> {
  const result = await pool.query(
    `SELECT ur.id, ur.full_name, ur.is_active, ur.added_at,
            r.id as repo_id, r.github_id, r.name, r.full_name as repo_full_name, r.owner,
            r.description, r.url, r.stars, r.forks, r.language, r.stars_24h, r.stars_7d,
            r.score, r.pushed_at
     FROM user_repositories ur
     JOIN repositories r ON r.id = ur.repository_id
     WHERE ur.user_id = $1 AND ur.is_active = true
     ORDER BY r.score DESC, r.stars DESC`,
    [userId],
  );
  return result.rows.map(mapUserRepositoryRow);
}

export async function getUserRepositoryById(userId: number, userRepoId: number): Promise<UserRepository> {
  const result = await pool.query(
    `SELECT ur.id, ur.full_name, ur.is_active, ur.added_at,
            r.id as repo_id, r.github_id, r.name, r.full_name as repo_full_name, r.owner,
            r.description, r.url, r.stars, r.forks, r.language, r.stars_24h, r.stars_7d,
            r.score, r.pushed_at
     FROM user_repositories ur
     JOIN repositories r ON r.id = ur.repository_id
     WHERE ur.id = $1 AND ur.user_id = $2`,
    [userRepoId, userId],
  );
  if (result.rowCount === 0) {
    throw new Error("Repository not found");
  }
  return mapUserRepositoryRow(result.rows[0]);
}

export async function removeUserRepository(userId: number, userRepoId: number): Promise<void> {
  await pool.query(
    `UPDATE user_repositories SET is_active = false WHERE id = $1 AND user_id = $2`,
    [userRepoId, userId],
  );
}

export interface SnapshotPoint {
  collectedAt: string;
  stars: number;
  forks: number;
  openIssues: number;
}

export async function getRepositoryHistory(userId: number, userRepoId: number): Promise<SnapshotPoint[]> {
  const result = await pool.query(
    `SELECT s.collected_at, s.stars, s.forks, s.open_issues
     FROM repository_snapshots s
     JOIN user_repositories ur ON ur.repository_id = s.repository_id
     WHERE ur.id = $1 AND ur.user_id = $2
     ORDER BY s.collected_at ASC`,
    [userRepoId, userId],
  );
  return result.rows.map((row: any) => ({
    collectedAt: row.collected_at,
    stars: row.stars,
    forks: row.forks,
    openIssues: row.open_issues,
  }));
}

function mapUserRepositoryRow(row: any): UserRepository {
  return {
    id: row.id,
    fullName: row.full_name,
    isActive: row.is_active,
    addedAt: row.added_at,
    repository: {
      id: row.repo_id,
      githubId: row.github_id,
      name: row.name,
      fullName: row.repo_full_name,
      owner: row.owner,
      description: row.description,
      url: row.url,
      stars: row.stars,
      forks: row.forks,
      language: row.language,
      stars24h: row.stars_24h,
      stars7d: row.stars_7d,
      score: row.score,
      lastPush: row.pushed_at,
    },
  };
}

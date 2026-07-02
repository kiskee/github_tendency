import cron from "node-cron";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { getGitHubRepository, type GitHubRepo } from "../services/github.js";
import { pool } from "../services/database.js";
import { decryptToken } from "../utils/tokenCrypto.js";
import { saveSnapshot, updateRepoScores } from "../services/repoScoring.js";
import { fetchAndStoreCommits } from "../services/commits.js";
import { fetchAndStoreAllRepoData, type RepoActivitySummary } from "../services/repoData.js";

const tracer = trace.getTracer("user-repo-collector");
const SCHEDULE = "10 * * * *"; // Every hour

interface UserRepo {
  userId: number;
  userRepoId: number;
  repositoryId: number;
  fullName: string;
  githubTokenEncrypted: string;
}

interface CollectResult {
  usersProcessed: number;
  reposUpdated: number;
  errors: string[];
  durationMs: number;
}

async function getUserReposToScan(): Promise<UserRepo[]> {
  const result = await pool.query(
    `SELECT 
       ur.user_id as "userId",
       ur.id as "userRepoId",
       ur.repository_id as "repositoryId",
       ur.full_name as "fullName",
       u.github_token_encrypted as "githubTokenEncrypted"
     FROM user_repositories ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.is_active = true 
       AND u.github_token_encrypted IS NOT NULL
     ORDER BY ur.added_at ASC`
  );
  return result.rows;
}

async function fetchAndUpdateRepo(
  repo: UserRepo,
  span: any
): Promise<{ success: boolean; summary: any } | null> {
  try {
    if (!repo.githubTokenEncrypted || !repo.fullName) {
      console.error(`[user-repos] Missing data for repo: userId=${repo.userId}, fullName=${repo.fullName}, hasToken=${!!repo.githubTokenEncrypted}`);
      return null;
    }
    const token = decryptToken(repo.githubTokenEncrypted);
    
    // 1. Fetch basic repo data
    const githubRepo = await getGitHubRepository(repo.fullName, token);
    if (!githubRepo) {
      span.addEvent("repo_fetch_failed", { "repo.fullName": repo.fullName });
      return null;
    }

    // 2. Upsert repository metadata
    const repoRes = await pool.query(
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
        githubRepo.githubId, githubRepo.name, githubRepo.fullName,
        githubRepo.description, githubRepo.url, githubRepo.owner,
        githubRepo.stars, githubRepo.forks, githubRepo.watchers,
        githubRepo.openIssues, githubRepo.license, githubRepo.latestRelease,
        JSON.stringify(githubRepo.languages), JSON.stringify(githubRepo.topics),
        githubRepo.homepageUrl, githubRepo.isArchived, githubRepo.diskUsage,
        githubRepo.language, githubRepo.createdAt, githubRepo.lastPush,
      ]
    );

    const repoId = repoRes.rows[0].id;

    // 3. Save snapshot and update scores
    await saveSnapshot(repoId, githubRepo);
    await updateRepoScores(repoId, githubRepo);

    // 4. Fetch commits
    const [owner, name] = repo.fullName.split('/');
    await fetchAndStoreCommits(repoId, owner, name, token, 10);

    // 5. Fetch comprehensive repo data (PRs, Issues, Branches, Releases)
    const summary = await fetchAndStoreAllRepoData(repoId, owner, name, token);

    span.addEvent("repo_updated", {
      "repo.fullName": repo.fullName,
      "repo.stars": githubRepo.stars,
      "repo.prs": summary?.totalOpenPrs || 0,
      "repo.issues": summary?.totalOpenIssues || 0,
      "repo.branches": summary?.totalBranches || 0,
    });

    return { success: true, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    span.addEvent("repo_update_error", {
      "repo.fullName": repo.fullName,
      "error": message,
    });
    console.error(`[user-repos] Error updating ${repo.fullName}:`, error);
    return { success: false, summary: null };
  }
}

async function saveScanHistory(
  repositoryId: number,
  durationMs: number,
  status: string,
  summary: any,
  githubRepo: any,
  errorMessage?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO repo_scan_history 
       (repository_id, duration_ms, status, commits_found, prs_opened, prs_merged, prs_closed, 
        issues_opened, issues_closed, branches_count, releases_found, stars, forks, stars_delta_24h, score, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        repositoryId,
        durationMs,
        status,
        summary?.commits7d || 0,
        summary?.prsOpened7d || 0,
        summary?.prsMerged7d || 0,
        summary?.prsClosed7d || 0,
        summary?.issuesOpened7d || 0,
        summary?.issuesClosed7d || 0,
        summary?.totalBranches || 0,
        summary?.releases30d || 0,
        githubRepo?.stars || 0,
        githubRepo?.forks || 0,
        githubRepo?.stars24h || 0,
        githubRepo?.score || 0,
        errorMessage || null,
      ]
    );
  } catch (error) {
    console.error(`[user-repos] Failed to save scan history:`, error);
  }
}

export async function collectUserRepos(): Promise<CollectResult> {
  return tracer.startActiveSpan("user-repos.collect", async (span) => {
    const errors: string[] = [];
    let reposUpdated = 0;
    const startTime = Date.now();

    try {
      const userRepos = await getUserReposToScan();
      
      if (userRepos.length === 0) {
        console.log("[user-repos] No active user repos to scan");
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return { usersProcessed: 0, reposUpdated: 0, durationMs: 0, errors: [] };
      }

      console.log(`[user-repos] Starting collection for ${userRepos.length} user repos`);

      // Group by user to respect rate limits
      const userRepoMap = new Map<number, UserRepo[]>();
      for (const repo of userRepos) {
        const existing = userRepoMap.get(repo.userId) || [];
        existing.push(repo);
        userRepoMap.set(repo.userId, existing);
      }

      let usersProcessed = 0;

      for (const [userId, repos] of userRepoMap) {
        try {
          for (const repo of repos) {
            const startTime = Date.now();
            const result = await fetchAndUpdateRepo(repo, span);
            const duration = Date.now() - startTime;
            
            if (result) {
              reposUpdated++;
              
              // Get github repo data for history
              const githubRepo = await getGitHubRepository(repo.fullName, decryptToken(repo.githubTokenEncrypted)).catch(() => null);
              await saveScanHistory(
                repo.repositoryId,
                duration,
                'success',
                result.summary,
                githubRepo
              );
            } else {
              // Save failed scan
              const [owner, name] = repo.fullName.split('/') || [];
              if (owner && name) {
                await saveScanHistory(
                  repo.repositoryId,
                  Date.now() - startTime,
                  'error',
                  null,
                  null,
                  'Failed to fetch data'
                );
              }
            }
          }
          usersProcessed++;
          
          // Delay between users
          if (userRepoMap.size > 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          errors.push(`User ${userId}: ${message}`);
          console.error(`[user-repos] Error processing user ${userId}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      span.setAttribute("user-repos.duration_ms", duration);
      span.setAttribute("user-repos.users_count", usersProcessed);
      span.setAttribute("user-repos.repos_updated", reposUpdated);
      span.setStatus({ code: SpanStatusCode.OK });
      console.log(`[user-repos] Collection done in ${duration}ms. Updated ${reposUpdated} repos from ${usersProcessed} users`);

      return {
        usersProcessed,
        reposUpdated,
        durationMs: duration,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      console.error("[user-repos] Collection failed:", error);
      errors.push(message);

      return {
        usersProcessed: 0,
        reposUpdated,
        durationMs: Date.now() - startTime,
        errors,
      };
    } finally {
      span.end();
    }
  });
}

export function startUserRepoCollector() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[user-repos] Invalid cron schedule: ${SCHEDULE}`);
    return;
  }

  console.log(`[user-repos] Scheduler started: "${SCHEDULE}" | Scanning all active user repos with personal tokens`);
  cron.schedule(SCHEDULE, collectUserRepos);
}

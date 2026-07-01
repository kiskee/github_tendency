import cron from "node-cron";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { searchGitHubRepos } from "../services/github";
import { pool } from "../services/database";
import { redisClient } from "../services/redis";

const tracer = trace.getTracer("trends-collector");

const GITHUB_TOKEN_CRON = process.env.GITHUB_TOKEN_CRON;
const SCHEDULE = "0 * * * *";

interface CollectResult {
  keywordsProcessed: number;
  reposSaved: number;
  durationMs: number;
  errors: string[];
}

async function invalidateTrendsCache(): Promise<void> {
  try {
    let cursor = 0;
    do {
      const result = await redisClient.scan(cursor, { MATCH: "trends:*", COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redisClient.del(result.keys);
      }
    } while (cursor !== 0);
    console.log("[cache] Trends cache invalidated after collection");
  } catch (err) {
    console.error("[cache] Failed to invalidate trends cache:", err);
  }
}

async function getAllKeywords(): Promise<{ id: number; keyword: string; category: string }[]> {
  const result = await pool.query(
    `SELECT id, keyword, category FROM keywords WHERE is_active = true ORDER BY id`
  );
  return result.rows;
}

async function markAllScanned(): Promise<void> {
  await pool.query(
    `UPDATE keywords SET times_scanned = times_scanned + 1, last_scanned_at = NOW() WHERE is_active = true`
  );
}

export async function collectTrends(): Promise<CollectResult> {
  return tracer.startActiveSpan("trends.collect", async (span) => {
    const errors: string[] = [];
    let reposSaved = 0;
    const startTime = Date.now();

    try {
      const keywords = await getAllKeywords();
      if (keywords.length === 0) {
        console.log("[trends] No active keywords found in DB");
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return { keywordsProcessed: 0, reposSaved: 0, durationMs: 0, errors: [] };
      }

      console.log(`[trends] Starting collection for all ${keywords.length} keywords`);

      if (!GITHUB_TOKEN_CRON) {
        throw new Error("GITHUB_TOKEN_CRON no definido en .env");
      }

      for (const { keyword } of keywords) {
        const result = await searchGitHubRepos(keyword, GITHUB_TOKEN_CRON);
        if (!result) {
          console.log(`[trends] No results for "${keyword}", skipping`);
          continue;
        }

        const rl = result.rateLimit;
        if (rl) {
          console.log(`[trends] "${keyword}": ${result.repositories.length} repos | rateLimit: cost=${rl.cost} rem=${rl.remaining}`);
        }

        const searchRes = await pool.query(
          `INSERT INTO searches (keyword, search_count, last_searched_at)
           VALUES ($1, 1, NOW())
           ON CONFLICT (keyword) DO UPDATE
           SET search_count = searches.search_count + 1,
               last_searched_at = NOW()
           RETURNING id`,
          [keyword]
        );
        const searchId = searchRes.rows[0].id;

        for (const repo of result.repositories) {
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
              repo.githubId, repo.name, repo.fullName,
              repo.description, repo.url, repo.owner,
              repo.stars, repo.forks, repo.watchers,
              repo.openIssues, repo.license, repo.latestRelease,
              JSON.stringify(repo.languages), JSON.stringify(repo.topics),
              repo.homepageUrl, repo.isArchived, repo.diskUsage,
              repo.language, repo.createdAt, repo.lastPush,
            ]
          );
          const repoId = repoRes.rows[0].id;

          await pool.query(
            `INSERT INTO search_repository (search_id, repository_id)
             VALUES ($1, $2)
             ON CONFLICT (search_id, repository_id) DO NOTHING`,
            [searchId, repoId]
          );
        }

        reposSaved += result.repositories.length;
      }

      await markAllScanned();

      const duration = Date.now() - startTime;
      span.setAttribute("trends.duration_ms", duration);
      span.setAttribute("trends.keywords_count", keywords.length);
      span.setStatus({ code: SpanStatusCode.OK });
      console.log(`[trends] Collection done in ${duration}ms`);

      await invalidateTrendsCache();

      return {
        keywordsProcessed: keywords.length,
        reposSaved,
        durationMs: duration,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      console.error("[trends] Collection failed:", error);
      errors.push(message);

      return {
        keywordsProcessed: 0,
        reposSaved,
        durationMs: Date.now() - startTime,
        errors,
      };
    } finally {
      span.end();
    }
  });
}

export function startTrendsCollector() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[trends] Invalid cron schedule: ${SCHEDULE}`);
    return;
  }

  console.log(`[trends] Scheduler started: "${SCHEDULE}" | All keywords | Token cron: ${GITHUB_TOKEN_CRON ? "Set" : "Missing"}`);
  cron.schedule(SCHEDULE, collectTrends);
}

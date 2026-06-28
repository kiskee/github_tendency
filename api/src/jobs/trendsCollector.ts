import cron from "node-cron";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { searchGitHubRepos } from "../services/github";
import { pool } from "../services/database";

const tracer = trace.getTracer("trends-collector");

const KEYWORDS = (process.env.TREND_KEYWORDS || "opentelemetry,kubernetes,go,ts").split(",");
const SCHEDULE = process.env.CRON_SCHEDULE || "0 * * * *";

interface CollectResult {
  keywordsProcessed: number;
  reposSaved: number;
  durationMs: number;
  errors: string[];
}

export async function collectTrends(): Promise<CollectResult> {
  return tracer.startActiveSpan("trends.collect", async (span) => {
    const errors: string[] = [];
    let reposSaved = 0;
    const startTime = Date.now();

    try {
      console.log(`[trends] Starting collection for ${KEYWORDS.length} keywords`);

      for (const keyword of KEYWORDS) {
        const result = await searchGitHubRepos(keyword);
        if (!result) {
          console.log(`[trends] No results for "${keyword}", skipping`);
          continue;
        }

        // UPSERT search
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
          // UPSERT repository
          const repoRes = await pool.query(
            `INSERT INTO repositories (github_id, name, full_name, description, url, owner, stars, forks, language, created_at, pushed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (github_id) DO UPDATE
             SET stars = EXCLUDED.stars,
                 forks = EXCLUDED.forks,
                 description = EXCLUDED.description,
                 pushed_at = EXCLUDED.pushed_at,
                 collected_at = NOW()
             RETURNING id`,
            [
              repo.githubId,
              repo.name,
              repo.fullName,
              repo.description,
              repo.url,
              repo.owner,
              repo.stars,
              repo.forks,
              repo.language,
              repo.createdAt,
              repo.lastPush,
            ]
          );
          const repoId = repoRes.rows[0].id;

          // INSERT search ↔ repository link
          await pool.query(
            `INSERT INTO search_repository (search_id, repository_id)
             VALUES ($1, $2)
             ON CONFLICT (search_id, repository_id) DO NOTHING`,
            [searchId, repoId]
          );
        }

        console.log(`[trends] "${keyword}": ${result.repositories.length} repos saved`);
        reposSaved += result.repositories.length;
      }

      const duration = Date.now() - startTime;
      span.setAttribute("trends.duration_ms", duration);
      span.setAttribute("trends.keywords_count", KEYWORDS.length);
      span.setStatus({ code: SpanStatusCode.OK });
      console.log(`[trends] Collection done in ${duration}ms`);

      return {
        keywordsProcessed: KEYWORDS.length,
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
        keywordsProcessed: KEYWORDS.length,
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

  console.log(`[trends] Scheduler started: "${SCHEDULE}" | Keywords: ${KEYWORDS.join(", ")}`);
  cron.schedule(SCHEDULE, collectTrends);
}

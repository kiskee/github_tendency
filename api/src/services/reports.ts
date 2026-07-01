import { pool } from "./database.js";

interface TopRepo {
  full_name: string;
  owner: string;
  stars: number;
  forks: number;
  language: string;
  description: string;
  url: string;
}

interface LanguageBreakdown {
  language: string;
  count: number;
  percentage: number;
}

interface OwnerStat {
  owner: string;
  repo_count: number;
  total_stars: number;
}

interface PerKeyword {
  keyword: string;
  total_repos: number;
  avg_stars: number;
  max_stars: number;
  total_forks: number;
}

interface KeywordPopularity {
  keyword: string;
  search_count: number;
  last_searched_at: string;
}

interface Report {
  generated_at: string;
  top_repos: TopRepo[];
  language_breakdown: LanguageBreakdown[];
  top_owners: OwnerStat[];
  per_keyword: PerKeyword[];
  newest_repos: TopRepo[];
  most_recently_pushed: TopRepo[];
  keyword_popularity: KeywordPopularity[];
  totals: {
    total_repos: number;
    total_keywords: number;
    total_owners: number;
  };
}

export async function generateReport(): Promise<Report> {
  const [
    topReposRes,
    languageRes,
    ownersRes,
    keywordStatsRes,
    newestRes,
    pushedRes,
    keywordPopRes,
    totalsRes,
  ] = await Promise.all([
    pool.query<TopRepo>(
      `SELECT full_name, owner, stars, forks, language, description, url
       FROM repositories ORDER BY stars DESC LIMIT 10`
    ),
    pool.query<LanguageBreakdown>(
      `SELECT language, COUNT(*) as count,
              ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
       FROM repositories
       WHERE language IS NOT NULL AND language != 'Unknown'
       GROUP BY language ORDER BY count DESC`
    ),
    pool.query<OwnerStat>(
      `SELECT owner, COUNT(*) as repo_count, SUM(stars) as total_stars
       FROM repositories WHERE owner IS NOT NULL
       GROUP BY owner ORDER BY repo_count DESC LIMIT 20`
    ),
    pool.query<PerKeyword>(
      `SELECT s.keyword, COUNT(r.id) as total_repos,
              ROUND(AVG(r.stars), 0) as avg_stars,
              MAX(r.stars) as max_stars,
              SUM(r.forks) as total_forks
       FROM searches s
       JOIN search_repository sr ON sr.search_id = s.id
       JOIN repositories r ON r.id = sr.repository_id
       GROUP BY s.keyword ORDER BY total_repos DESC`
    ),
    pool.query<TopRepo>(
      `SELECT full_name, owner, stars, forks, language, description, url
       FROM repositories ORDER BY created_at DESC LIMIT 10`
    ),
    pool.query<TopRepo>(
      `SELECT full_name, owner, stars, forks, language, description, url
       FROM repositories ORDER BY pushed_at DESC LIMIT 10`
    ),
    pool.query<KeywordPopularity>(
      `SELECT keyword, search_count, last_searched_at
       FROM searches ORDER BY search_count DESC`
    ),
    pool.query<{
      total_repos: number;
      total_keywords: number;
      total_owners: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM repositories) as total_repos,
        (SELECT COUNT(*) FROM searches) as total_keywords,
        (SELECT COUNT(DISTINCT owner) FROM repositories WHERE owner IS NOT NULL) as total_owners`
    ),
  ]);

  return {
    generated_at: new Date().toISOString(),
    top_repos: topReposRes.rows,
    language_breakdown: languageRes.rows,
    top_owners: ownersRes.rows,
    per_keyword: keywordStatsRes.rows,
    newest_repos: newestRes.rows,
    most_recently_pushed: pushedRes.rows,
    keyword_popularity: keywordPopRes.rows,
    totals: totalsRes.rows[0],
  };
}

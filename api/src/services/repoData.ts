import axios from "axios";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { pool } from "./database.js";
import { GITHUB_GRAPHQL_URL } from "./github.js";

const tracer = trace.getTracer("repo-data");

// ============================================
// GraphQL Queries
// ============================================

const GET_REPO_FULL_DATA_QUERY = `
  query GetRepoFullData($owner: String!, $name: String!) {
    rateLimit { cost, remaining, resetAt }
    repository(owner: $owner, name: $name) {
      pullRequests(first: 30, states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: DESC}) {
        edges {
          node {
            number
            title
            state
            author { login, avatarUrl }
            createdAt
            updatedAt
            closedAt
            mergedAt
            mergeable
            additions
            deletions
            changedFiles
            reviews(first: 10) {
              nodes {
                author { login }
                state
                submittedAt
              }
            }
            labels(first: 10) { nodes { name } }
            headRefName
            baseRefName
            url
          }
        }
      }
      issues(first: 30, states: [OPEN, CLOSED], orderBy: {field: CREATED_AT, direction: DESC}) {
        edges {
          node {
            number
            title
            state
            author { login, avatarUrl }
            createdAt
            updatedAt
            closedAt
            labels(first: 10) { nodes { name } }
            assignees(first: 10) { nodes { login, avatarUrl } }
            milestone { title }
            comments { totalCount }
            url
          }
        }
      }
      defaultBranchRef { name }
      refs(first: 50, refPrefix: "refs/heads/", orderBy: {field: ALPHABETICAL, direction: ASC}) {
        edges {
          node {
            name
            target {
              ... on Commit {
                oid
                messageHeadline
                author { name, date }
                pushedAt
              }
            }
          }
        }
      }
      releases(first: 20, orderBy: {field: CREATED_AT, direction: DESC}) {
        edges {
          node {
            name
            tagName
            description
            author { login }
            createdAt
            publishedAt
            isPrerelease
            isDraft
            url
          }
        }
      }
    }
  }
`;

// ============================================
// TypeScript Interfaces
// ============================================

export interface PRData {
  number: number;
  title: string;
  state: string;
  authorLogin: string;
  authorAvatar: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  mergeable: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewers: { login: string; state: string; submittedAt: string | null }[];
  labels: string[];
  headBranch: string;
  baseBranch: string;
  url: string;
}

export interface IssueData {
  number: number;
  title: string;
  state: string;
  authorLogin: string;
  authorAvatar: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: string[];
  assignees: { login: string; avatar: string | null }[];
  milestone: string | null;
  commentsCount: number;
  url: string;
}

export interface BranchData {
  name: string;
  isDefault: boolean;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastCommitAuthor: string | null;
  lastCommitDate: string | null;
  hasOpenPr: boolean;
}

export interface ReleaseData {
  tagName: string;
  name: string | null;
  body: string | null;
  authorLogin: string | null;
  createdAt: string;
  publishedAt: string | null;
  isPrerelease: boolean;
  isDraft: boolean;
  url: string;
}

export interface RepoActivitySummary {
  prsOpened7d: number;
  prsMerged7d: number;
  prsClosed7d: number;
  issuesOpened7d: number;
  issuesClosed7d: number;
  commits7d: number;
  releases30d: number;
  activeContributors: number;
  totalBranches: number;
  totalOpenPrs: number;
  totalOpenIssues: number;
}

// ============================================
// Fetch from GitHub
// ============================================

async function fetchFullRepoData(
  owner: string,
  name: string,
  token: string
): Promise<{
  prs: PRData[];
  issues: IssueData[];
  branches: BranchData[];
  releases: ReleaseData[];
} | null> {
  return tracer.startActiveSpan("github.graphql.full_repo_data", async (span) => {
    try {
      span.setAttribute("github.repository", `${owner}/${name}`);

      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query: GET_REPO_FULL_DATA_QUERY,
          variables: { owner, name },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        console.error(`[repoData] GraphQL errors for ${owner}/${name}:`, JSON.stringify(response.data.errors));
        span.setStatus({ code: SpanStatusCode.ERROR, message: "GraphQL errors" });
        return null;
      }

      const rateLimit = response.data.data.rateLimit;
      span.setAttribute("graphql.cost", rateLimit.cost);
      span.setAttribute("graphql.remaining", rateLimit.remaining);

      const repo = response.data.data.repository;
      if (!repo) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "Repository not found" });
        return null;
      }

      // Parse PRs
      const prs: PRData[] = (repo.pullRequests?.edges || []).map((edge: any) => {
        const node = edge.node;
        return {
          number: node.number,
          title: node.title,
          state: node.state,
          authorLogin: node.author?.login || "unknown",
          authorAvatar: node.author?.avatarUrl || null,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          closedAt: node.closedAt,
          mergedAt: node.mergedAt,
          mergeable: node.mergeable,
          additions: node.additions || 0,
          deletions: node.deletions || 0,
          changedFiles: node.changedFiles || 0,
          reviewers: (node.reviews?.nodes || []).map((r: any) => ({
            login: r.author?.login || "unknown",
            state: r.state,
            submittedAt: r.submittedAt,
          })),
          labels: (node.labels?.nodes || []).map((l: any) => l.name),
          headBranch: node.headRefName || "",
          baseBranch: node.baseRefName || "",
          url: node.url,
        };
      });

      // Parse Issues
      const issues: IssueData[] = (repo.issues?.edges || []).map((edge: any) => {
        const node = edge.node;
        return {
          number: node.number,
          title: node.title,
          state: node.state,
          authorLogin: node.author?.login || "unknown",
          authorAvatar: node.author?.avatarUrl || null,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          closedAt: node.closedAt,
          labels: (node.labels?.nodes || []).map((l: any) => l.name),
          assignees: (node.assignees?.nodes || []).map((a: any) => ({
            login: a.login,
            avatar: a.avatarUrl,
          })),
          milestone: node.milestone?.title || null,
          commentsCount: node.comments?.totalCount || 0,
          url: node.url,
        };
      });

      // Parse Branches
      const defaultBranch = repo.defaultBranchRef?.name || "main";
      const branches: BranchData[] = (repo.refs?.edges || []).map((edge: any) => {
        const node = edge.node;
        const target = node.target;
        return {
          name: node.name,
          isDefault: node.name === defaultBranch,
          lastCommitSha: target?.oid || null,
          lastCommitMessage: target?.messageHeadline || null,
          lastCommitAuthor: target?.author?.name || null,
          lastCommitDate: target?.author?.date || null,
          hasOpenPr: false, // Will be calculated later
        };
      });

      // Mark branches with open PRs
      const branchNamesWithPrs = new Set(prs.filter(p => p.state === "OPEN").map(p => p.headBranch));
      branches.forEach(b => {
        if (branchNamesWithPrs.has(b.name)) {
          b.hasOpenPr = true;
        }
      });

      // Parse Releases
      const releases: ReleaseData[] = (repo.releases?.edges || []).map((edge: any) => {
        const node = edge.node;
        return {
          tagName: node.tagName,
          name: node.name,
          body: node.description,
          authorLogin: node.author?.login || null,
          createdAt: node.createdAt,
          publishedAt: node.publishedAt,
          isPrerelease: node.isPrerelease || false,
          isDraft: node.isDraft || false,
          url: node.url,
        };
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute("repo.prs_count", prs.length);
      span.setAttribute("repo.issues_count", issues.length);
      span.setAttribute("repo.branches_count", branches.length);
      span.setAttribute("repo.releases_count", releases.length);

      return { prs, issues, branches, releases };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[repoData] Failed to fetch data for ${owner}/${name}:`, error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      return null;
    } finally {
      span.end();
    }
  });
}

// ============================================
// Store functions
// ============================================

async function storePullRequests(repositoryId: number, prs: PRData[]): Promise<void> {
  for (const pr of prs) {
    try {
      await pool.query(
        `INSERT INTO repository_pull_requests (repository_id, github_pr_id, number, title, state, author_login, author_avatar, created_at, updated_at, closed_at, merged_at, mergeable, additions, deletions, changed_files, reviewers, labels, head_branch, base_branch, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT (github_pr_id) DO UPDATE
         SET state = EXCLUDED.state,
             updated_at = EXCLUDED.updated_at,
             closed_at = EXCLUDED.closed_at,
             merged_at = EXCLUDED.merged_at,
             additions = EXCLUDED.additions,
             deletions = EXCLUDED.deletions,
             changed_files = EXCLUDED.changed_files,
             reviewers = EXCLUDED.reviewers,
             labels = EXCLUDED.labels,
             collected_at = NOW()`,
        [
          repositoryId, pr.number, pr.number, pr.title, pr.state,
          pr.authorLogin, pr.authorAvatar, pr.createdAt, pr.updatedAt,
          pr.closedAt, pr.mergedAt, pr.mergeable, pr.additions, pr.deletions,
          pr.changedFiles, JSON.stringify(pr.reviewers), JSON.stringify(pr.labels),
          pr.headBranch, pr.baseBranch, pr.url,
        ]
      );
    } catch (error) {
      console.error(`[repoData] Failed to store PR #${pr.number}:`, error);
    }
  }
}

async function storeIssues(repositoryId: number, issues: IssueData[]): Promise<void> {
  for (const issue of issues) {
    try {
      await pool.query(
        `INSERT INTO repository_issues (repository_id, github_issue_id, number, title, state, author_login, author_avatar, created_at, updated_at, closed_at, labels, assignees, milestone, comments_count, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (github_issue_id) DO UPDATE
         SET state = EXCLUDED.state,
             updated_at = EXCLUDED.updated_at,
             closed_at = EXCLUDED.closed_at,
             labels = EXCLUDED.labels,
             assignees = EXCLUDED.assignees,
             comments_count = EXCLUDED.comments_count,
             collected_at = NOW()`,
        [
          repositoryId, issue.number, issue.number, issue.title, issue.state,
          issue.authorLogin, issue.authorAvatar, issue.createdAt, issue.updatedAt,
          issue.closedAt, JSON.stringify(issue.labels), JSON.stringify(issue.assignees),
          issue.milestone, issue.commentsCount, issue.url,
        ]
      );
    } catch (error) {
      console.error(`[repoData] Failed to store issue #${issue.number}:`, error);
    }
  }
}

async function storeBranches(repositoryId: number, branches: BranchData[]): Promise<void> {
  for (const branch of branches) {
    try {
      await pool.query(
        `INSERT INTO repository_branches (repository_id, name, is_default, last_commit_sha, last_commit_message, last_commit_author, last_commit_date, has_open_pr)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (repository_id, name) DO UPDATE
         SET is_default = EXCLUDED.is_default,
             last_commit_sha = EXCLUDED.last_commit_sha,
             last_commit_message = EXCLUDED.last_commit_message,
             last_commit_author = EXCLUDED.last_commit_author,
             last_commit_date = EXCLUDED.last_commit_date,
             has_open_pr = EXCLUDED.has_open_pr,
             collected_at = NOW()`,
        [
          repositoryId, branch.name, branch.isDefault, branch.lastCommitSha,
          branch.lastCommitMessage, branch.lastCommitAuthor, branch.lastCommitDate,
          branch.hasOpenPr,
        ]
      );
    } catch (error) {
      console.error(`[repoData] Failed to store branch ${branch.name}:`, error);
    }
  }
}

async function storeReleases(repositoryId: number, releases: ReleaseData[]): Promise<void> {
  for (const release of releases) {
    try {
      const releaseId = parseInt(release.tagName.replace(/[^0-9]/g, "").slice(0, 10)) || Date.now();
      await pool.query(
        `INSERT INTO repository_releases (repository_id, github_release_id, tag_name, name, body, author_login, created_at, published_at, is_prerelease, is_draft, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (github_release_id) DO UPDATE
         SET body = EXCLUDED.body,
             published_at = EXCLUDED.published_at,
             collected_at = NOW()`,
        [
          repositoryId, releaseId, release.tagName, release.name, release.body,
          release.authorLogin, release.createdAt, release.publishedAt,
          release.isPrerelease, release.isDraft, release.url,
        ]
      );
    } catch (error) {
      console.error(`[repoData] Failed to store release ${release.tagName}:`, error);
    }
  }
}

async function calculateActivitySummary(repositoryId: number): Promise<RepoActivitySummary> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [prsOpened7d, prsMerged7d, prsClosed7d] = await Promise.all([
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_pull_requests WHERE repository_id = $1 AND created_at >= $2`,
      [repositoryId, sevenDaysAgo]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_pull_requests WHERE repository_id = $1 AND merged_at >= $2`,
      [repositoryId, sevenDaysAgo]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_pull_requests WHERE repository_id = $1 AND closed_at >= $2 AND merged_at IS NULL`,
      [repositoryId, sevenDaysAgo]
    ),
  ]);

  const [issuesOpened7d, issuesClosed7d] = await Promise.all([
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_issues WHERE repository_id = $1 AND created_at >= $2`,
      [repositoryId, sevenDaysAgo]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_issues WHERE repository_id = $1 AND closed_at >= $2`,
      [repositoryId, sevenDaysAgo]
    ),
  ]);

  const [commits7d, releases30d, activeContributors, totalBranches, totalOpenPrs, totalOpenIssues] = await Promise.all([
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_commits WHERE repository_id = $1 AND author_date >= $2`,
      [repositoryId, sevenDaysAgo]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_releases WHERE repository_id = $1 AND published_at >= $2`,
      [repositoryId, thirtyDaysAgo]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(DISTINCT author_login)::int as count FROM repository_commits WHERE repository_id = $1 AND author_date >= $2 AND author_login IS NOT NULL`,
      [repositoryId, thirtyDaysAgo]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_branches WHERE repository_id = $1`,
      [repositoryId]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_pull_requests WHERE repository_id = $1 AND state = 'OPEN'`,
      [repositoryId]
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM repository_issues WHERE repository_id = $1 AND state = 'OPEN'`,
      [repositoryId]
    ),
  ]);

  return {
    prsOpened7d: prsOpened7d.rows[0].count,
    prsMerged7d: prsMerged7d.rows[0].count,
    prsClosed7d: prsClosed7d.rows[0].count,
    issuesOpened7d: issuesOpened7d.rows[0].count,
    issuesClosed7d: issuesClosed7d.rows[0].count,
    commits7d: commits7d.rows[0].count,
    releases30d: releases30d.rows[0].count,
    activeContributors: activeContributors.rows[0].count,
    totalBranches: totalBranches.rows[0].count,
    totalOpenPrs: totalOpenPrs.rows[0].count,
    totalOpenIssues: totalOpenIssues.rows[0].count,
  };
}

// ============================================
// Main function
// ============================================

export async function fetchAndStoreAllRepoData(
  repositoryId: number,
  owner: string,
  name: string,
  token: string
): Promise<RepoActivitySummary | null> {
  console.log(`[repoData] Fetching full data for ${owner}/${name}`);

  const data = await fetchFullRepoData(owner, name, token);
  if (!data) {
    console.log(`[repoData] No data returned for ${owner}/${name}`);
    return null;
  }

  console.log(`[repoData] Got ${data.prs.length} PRs, ${data.issues.length} issues, ${data.branches.length} branches, ${data.releases.length} releases`);

  await Promise.all([
    storePullRequests(repositoryId, data.prs),
    storeIssues(repositoryId, data.issues),
    storeBranches(repositoryId, data.branches),
    storeReleases(repositoryId, data.releases),
  ]);

  const summary = await calculateActivitySummary(repositoryId);
  console.log(`[repoData] Activity summary: ${summary.prsMerged7d} PRs merged, ${summary.issuesClosed7d} issues closed, ${summary.commits7d} commits in 7d`);

  return summary;
}

// ============================================
// Getter functions for API
// ============================================

export async function getRepositoryPRs(
  repositoryId: number,
  state?: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ prs: any[]; total: number }> {
  let query = `SELECT * FROM repository_pull_requests WHERE repository_id = $1`;
  const params: any[] = [repositoryId];

  if (state) {
    query += ` AND state = $${params.length + 1}`;
    params.push(state);
  }

  const countQuery = query.replace("SELECT *", "SELECT COUNT(*)::int as count");
  const countResult = await pool.query(countQuery, params);
  const total = countResult.rows[0].count;

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return { prs: result.rows, total };
}

export async function getRepositoryIssues(
  repositoryId: number,
  state?: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ issues: any[]; total: number }> {
  let query = `SELECT * FROM repository_issues WHERE repository_id = $1`;
  const params: any[] = [repositoryId];

  if (state) {
    query += ` AND state = $${params.length + 1}`;
    params.push(state);
  }

  const countQuery = query.replace("SELECT *", "SELECT COUNT(*)::int as count");
  const countResult = await pool.query(countQuery, params);
  const total = countResult.rows[0].count;

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return { issues: result.rows, total };
}

export async function getRepositoryBranches(
  repositoryId: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ branches: any[]; total: number }> {
  const countResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM repository_branches WHERE repository_id = $1`,
    [repositoryId]
  );
  const total = countResult.rows[0].count;

  const result = await pool.query(
    `SELECT * FROM repository_branches WHERE repository_id = $1 ORDER BY is_default DESC, name ASC LIMIT $2 OFFSET $3`,
    [repositoryId, limit, offset]
  );
  return { branches: result.rows, total };
}

export async function getRepositoryReleases(
  repositoryId: number,
  limit: number = 20,
  offset: number = 0
): Promise<{ releases: any[]; total: number }> {
  const countResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM repository_releases WHERE repository_id = $1`,
    [repositoryId]
  );
  const total = countResult.rows[0].count;

  const result = await pool.query(
    `SELECT * FROM repository_releases WHERE repository_id = $1 ORDER BY published_at DESC NULLS LAST LIMIT $2 OFFSET $3`,
    [repositoryId, limit, offset]
  );
  return { releases: result.rows, total };
}

export async function getActivitySummary(
  repositoryId: number
): Promise<RepoActivitySummary> {
  return calculateActivitySummary(repositoryId);
}

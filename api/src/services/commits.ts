import axios from "axios";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { pool } from "./database.js";
import { GITHUB_GRAPHQL_URL } from "./github.js";

const tracer = trace.getTracer("github-commits");

interface CommitInfo {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authorDate: string | null;
  url: string;
}

interface CommitsResponse {
  commits: CommitInfo[];
  hasMore: boolean;
}

const GET_REPOSITORY_COMMITS_QUERY = `
  query GetRepositoryCommits($owner: String!, $name: String!, $first: Int!) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: $first) {
              edges {
                node {
                  oid
                  messageHeadline
                  messageBody
                  author {
                    name
                    email
                    date
                  }
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchCommitsFromGitHub(
  owner: string,
  name: string,
  token: string,
  first: number = 10
): Promise<CommitsResponse> {
  return tracer.startActiveSpan("github.graphql.commits", async (span) => {
    try {
      span.setAttribute("github.repository.owner", owner);
      span.setAttribute("github.repository.name", name);
      span.setAttribute("github.commits.first", first);

      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query: GET_REPOSITORY_COMMITS_QUERY,
          variables: { owner, name, first },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      if (response.data.errors) {
        console.error(`[commits] GraphQL errors for ${owner}/${name}:`, JSON.stringify(response.data.errors));
        span.setStatus({ code: SpanStatusCode.ERROR, message: "GraphQL errors" });
        span.setAttribute("github.commits.error", JSON.stringify(response.data.errors));
        return { commits: [], hasMore: false };
      }

      const rateLimit = response.data.data.rateLimit;
      span.setAttribute("graphql.cost", rateLimit.cost);
      span.setAttribute("graphql.remaining", rateLimit.remaining);

      const repo = response.data.data.repository;
      if (!repo || !repo.defaultBranchRef?.target?.history?.edges) {
        console.warn(`[commits] No commit history found for ${owner}/${name}. Repo: ${!!repo}, defaultBranchRef: ${!!repo?.defaultBranchRef}`);
        span.setStatus({ code: SpanStatusCode.ERROR, message: "No commit history found" });
        return { commits: [], hasMore: false };
      }

      const edges = repo.defaultBranchRef.target.history.edges;
      const commits: CommitInfo[] = edges.map((edge: any) => ({
        sha: edge.node.oid,
        message: edge.node.messageHeadline,
        authorName: edge.node.author?.name || null,
        authorEmail: edge.node.author?.email || null,
        authorDate: edge.node.author?.date || null,
        url: edge.node.url,
      }));

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute("github.commits.count", commits.length);

      return {
        commits,
        hasMore: edges.length === first,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      return { commits: [], hasMore: false };
    } finally {
      span.end();
    }
  });
}

export async function fetchAndStoreCommits(
  repositoryId: number,
  owner: string,
  name: string,
  token: string,
  first: number = 10
): Promise<CommitInfo[]> {
  console.log(`[commits] Fetching commits for ${owner}/${name} (first: ${first})`);
  const { commits } = await fetchCommitsFromGitHub(owner, name, token, first);
  console.log(`[commits] Got ${commits.length} commits from GitHub for ${owner}/${name}`);
  
  for (const commit of commits) {
    try {
      await pool.query(
        `INSERT INTO repository_commits (repository_id, sha, message, author_name, author_email, author_date, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (repository_id, sha) DO NOTHING`,
        [
          repositoryId,
          commit.sha,
          commit.message,
          commit.authorName,
          commit.authorEmail,
          commit.authorDate,
          commit.url,
        ]
      );
    } catch (error) {
      console.error(`[commits] Failed to store commit ${commit.sha}:`, error);
    }
  }
  
  console.log(`[commits] Stored ${commits.length} commits for ${owner}/${name} (repoId: ${repositoryId})`);
  return commits;
}

export async function getRepositoryCommits(
  repositoryId: number,
  limit: number = 10,
  offset: number = 0
): Promise<CommitInfo[]> {
  const result = await pool.query(
    `SELECT sha, message, author_name, author_email, author_date, url
     FROM repository_commits
     WHERE repository_id = $1
     ORDER BY author_date DESC
     LIMIT $2 OFFSET $3`,
    [repositoryId, limit, offset]
  );

  return result.rows.map((row: any) => ({
    sha: row.sha,
    message: row.message,
    authorName: row.author_name,
    authorEmail: row.author_email,
    authorDate: row.author_date,
    url: row.url,
  }));
}

export async function getRepositoryCommitsCount(repositoryId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int as count FROM repository_commits WHERE repository_id = $1`,
    [repositoryId]
  );
  return result.rows[0]?.count || 0;
}

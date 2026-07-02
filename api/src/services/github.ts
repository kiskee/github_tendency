import axios from "axios";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { searchRequestsTotal, cacheHits } from "../middlewares/metrics.js";
import { redisClient } from "../server.js";

const tracer = trace.getTracer("github-analytics-api");

const GITHUB_TOKEN_SEARCH = process.env.GITHUB_TOKEN_SEARCH;
export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const SEARCH_REPOSITORIES_QUERY = `
  query SearchRepositories($query: String!, $first: Int!) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    search(query: $query, type: REPOSITORY, first: $first) {
      repositoryCount
      edges {
        node {
          ... on Repository {
            databaseId
            id
            name
            owner {
              login
            }
            description
            url
            stargazerCount
            forkCount
            primaryLanguage {
              name
            }
            createdAt
            pushedAt
            watchers {
              totalCount
            }
            issues(states: OPEN) {
              totalCount
            }
            licenseInfo {
              key
              spdxId
            }
            languages(first: 5) {
              totalCount
              edges {
                size
                node {
                  name
                }
              }
            }
            latestRelease {
              tagName
              publishedAt
            }
            repositoryTopics(first: 10) {
              nodes {
                topic {
                  name
                }
              }
            }
            homepageUrl
            isArchived
            diskUsage
          }
        }
      }
    }
  }
`;

const GET_REPOSITORY_QUERY = `
  query GetRepository($owner: String!, $name: String!) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    repository(owner: $owner, name: $name) {
      databaseId
      id
      name
      owner {
        login
      }
      description
      url
      stargazerCount
      forkCount
      primaryLanguage {
        name
      }
      createdAt
      pushedAt
      watchers {
        totalCount
      }
      issues(states: OPEN) {
        totalCount
      }
      licenseInfo {
        key
        spdxId
      }
      languages(first: 5) {
        totalCount
        edges {
          size
          node {
            name
          }
        }
      }
      latestRelease {
        tagName
        publishedAt
      }
      repositoryTopics(first: 10) {
        nodes {
          topic {
            name
          }
        }
      }
      homepageUrl
      isArchived
      diskUsage
    }
  }
`;

function mapRepoNode(node: any): GitHubRepo {
  return {
    githubId: node.databaseId,
    name: node.name,
    fullName: `${node.owner.login}/${node.name}`,
    owner: node.owner.login,
    url: node.url,
    stars: node.stargazerCount,
    forks: node.forkCount,
    watchers: node.watchers?.totalCount || 0,
    openIssues: node.issues?.totalCount || 0,
    license: node.licenseInfo?.spdxId || node.licenseInfo?.key || null,
    language: node.primaryLanguage?.name || "Unknown",
    languages: (node.languages?.edges || []).map((e: any) => ({
      name: e.node.name,
      size: e.size,
    })),
    latestRelease: node.latestRelease?.tagName || null,
    topics: (node.repositoryTopics?.nodes || []).map((n: any) => n.topic?.name).filter(Boolean),
    homepageUrl: node.homepageUrl || null,
    isArchived: node.isArchived || false,
    diskUsage: node.diskUsage || 0,
    description: node.description,
    createdAt: node.createdAt,
    lastPush: node.pushedAt,
  };
}

export interface GitHubRepo {
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  url: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  license: string | null;
  language: string;
  languages: { name: string; size: number }[];
  topics: string[];
  latestRelease: string | null;
  homepageUrl: string | null;
  isArchived: boolean;
  diskUsage: number;
  description: string;
  createdAt: string;
  lastPush: string;
}

export interface SearchResult {
  keyword: string;
  totalCount: number;
  repositories: GitHubRepo[];
  rateLimit?: { cost: number; remaining: number; resetAt: string };
}

export async function searchGitHubRepos(keyword: string, token?: string, first = 10): Promise<SearchResult | null> {
  const activeToken = token || GITHUB_TOKEN_SEARCH;
  const pageSize = Math.max(1, Math.min(first, 100));

  return tracer.startActiveSpan("github.graphql.search", async (span) => {
    try {
      span.setAttribute("github.search.keyword", keyword);
      span.setAttribute("github.search.first", pageSize);

      const cacheKey = `search:${keyword}:${pageSize}`;
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        span.setAttribute("cache.hit", true);
        span.end();
        cacheHits.add(1, { keyword, status: "success" })
        return JSON.parse(cached);
      }
      if (!activeToken) {
        throw new Error("GitHub token no definido");
      }

      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query: SEARCH_REPOSITORIES_QUERY,
          variables: { query: keyword, first: pageSize },
        },
        {
          headers: {
            Authorization: `Bearer ${activeToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      if (response.data.errors) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "GraphQL errors" });
        span.setAttribute("github.search.error", JSON.stringify(response.data.errors));
        searchRequestsTotal.add(1, { keyword, status: "error" });
        return null;
      }

      const rateLimit = response.data.data.rateLimit;
      span.setAttribute("graphql.cost", rateLimit.cost);
      span.setAttribute("graphql.remaining", rateLimit.remaining);

      const data = response.data.data.search;
      span.setAttribute("github.search.repo_count", data.repositoryCount);
      span.setStatus({ code: SpanStatusCode.OK });
      searchRequestsTotal.add(1, { keyword, status: "success" });

      const responseFinal: SearchResult = {
        keyword,
        totalCount: data.repositoryCount,
        rateLimit: {
          cost: rateLimit.cost,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
        repositories: data.edges.map((edge: any) => mapRepoNode(edge.node)),
      };

      await redisClient.setEx(cacheKey, 60, JSON.stringify(responseFinal));
      return responseFinal
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      searchRequestsTotal.add(1, { keyword, status: "error" });
      return null;
    } finally {
      span.end();
    }
  });
}

export async function getGitHubRepository(
  fullName: string,
  token: string,
): Promise<GitHubRepo | null> {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid full_name format. Use owner/repo");
  }
  const [owner, name] = parts;

  return tracer.startActiveSpan("github.graphql.repository", async (span) => {
    try {
      span.setAttribute("github.repository.full_name", fullName);

      if (!token) {
        throw new Error("GitHub token required");
      }

      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query: GET_REPOSITORY_QUERY,
          variables: { owner, name },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      if (response.data.errors) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "GraphQL errors" });
        span.setAttribute("github.repository.error", JSON.stringify(response.data.errors));
        searchRequestsTotal.add(1, { keyword: fullName, status: "error" });
        return null;
      }

      const repo = response.data.data.repository;
      if (!repo) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "Repository not found" });
        return null;
      }

      const rateLimit = response.data.data.rateLimit;
      span.setAttribute("graphql.cost", rateLimit.cost);
      span.setAttribute("graphql.remaining", rateLimit.remaining);
      span.setStatus({ code: SpanStatusCode.OK });
      searchRequestsTotal.add(1, { keyword: fullName, status: "success" });

      return mapRepoNode(repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(error instanceof Error ? error : new Error(message));
      searchRequestsTotal.add(1, { keyword: fullName, status: "error" });
      return null;
    } finally {
      span.end();
    }
  });
}

import axios from "axios";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { searchRequestsTotal, cacheHits } from "../middlewares/metrics";
import { redisClient } from "../server";

const tracer = trace.getTracer("github-analytics-api");

const GITHUB_TOKEN_SEARCH = process.env.GITHUB_TOKEN_SEARCH;
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

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

export async function searchGitHubRepos(keyword: string, token?: string): Promise<SearchResult | null> {
  const activeToken = token || GITHUB_TOKEN_SEARCH;

  return tracer.startActiveSpan("github.graphql.search", async (span) => {
    try {
      span.setAttribute("github.search.keyword", keyword);

      const cacheKey = `search:${keyword}`;
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
          variables: { query: keyword, first: 10 },
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
        repositories: data.edges.map((edge: any) => ({
          githubId: edge.node.databaseId,
          name: edge.node.name,
          fullName: `${edge.node.owner.login}/${edge.node.name}`,
          owner: edge.node.owner.login,
          url: edge.node.url,
          stars: edge.node.stargazerCount,
          forks: edge.node.forkCount,
          watchers: edge.node.watchers?.totalCount || 0,
          openIssues: edge.node.issues?.totalCount || 0,
          license: edge.node.licenseInfo?.spdxId || edge.node.licenseInfo?.key || null,
          language: edge.node.primaryLanguage?.name || "Unknown",
          languages: (edge.node.languages?.edges || []).map((e: any) => ({
            name: e.node.name,
            size: e.size,
          })),
          latestRelease: edge.node.latestRelease?.tagName || null,
          topics: (edge.node.repositoryTopics?.nodes || []).map((n: any) => n.topic?.name).filter(Boolean),
          homepageUrl: edge.node.homepageUrl || null,
          isArchived: edge.node.isArchived || false,
          diskUsage: edge.node.diskUsage || 0,
          description: edge.node.description,
          createdAt: edge.node.createdAt,
          lastPush: edge.node.pushedAt,
        })),
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

import axios from "axios";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { searchRequestsTotal, cacheHits } from "../middlewares/metrics";
import { redisClient } from "../server";

const tracer = trace.getTracer("github-analytics-api");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const SEARCH_REPOSITORIES_QUERY = `
  query SearchRepositories($query: String!, $first: Int!) {
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
  language: string;
  description: string;
  createdAt: string;
  lastPush: string;
}

export interface SearchResult {
  keyword: string;
  totalCount: number;
  repositories: GitHubRepo[];
}

export async function searchGitHubRepos(keyword: string): Promise<SearchResult | null> {
  return tracer.startActiveSpan("github.graphql.search", async (span) => {
    try {
      span.setAttribute("github.search.keyword", keyword);

      //CACHEEEE
      const cacheKey = `search:${keyword}`;
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        span.setAttribute("cache.hit", true);
        span.end();
        cacheHits.add(1, { keyword, status: "success" })
        return JSON.parse(cached);
      }
      if (!GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN no está definido");
      }

      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query: SEARCH_REPOSITORIES_QUERY,
          variables: { query: keyword, first: 10 },
        },
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
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

      const data = response.data.data.search;
      span.setAttribute("github.search.repo_count", data.repositoryCount);
      span.setStatus({ code: SpanStatusCode.OK });
      searchRequestsTotal.add(1, { keyword, status: "success" });

      const responseFinal = {
        keyword,
        totalCount: data.repositoryCount,
        repositories: data.edges.map((edge: any) => ({
          githubId: edge.node.databaseId,
          name: edge.node.name,
          fullName: `${edge.node.owner.login}/${edge.node.name}`,
          owner: edge.node.owner.login,
          url: edge.node.url,
          stars: edge.node.stargazerCount,
          forks: edge.node.forkCount,
          language: edge.node.primaryLanguage?.name || "Unknown",
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
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

const SEED_KEYWORDS: { keyword: string; category: string }[] = [
  { keyword: "javascript", category: "language" },
  { keyword: "typescript", category: "language" },
  { keyword: "python", category: "language" },
  { keyword: "go", category: "language" },
  { keyword: "rust", category: "language" },
  { keyword: "java", category: "language" },
  { keyword: "kotlin", category: "language" },
  { keyword: "swift", category: "language" },
  { keyword: "cpp", category: "language" },
  { keyword: "c", category: "language" },
  { keyword: "csharp", category: "language" },
  { keyword: "ruby", category: "language" },
  { keyword: "php", category: "language" },
  { keyword: "dart", category: "language" },
  { keyword: "lua", category: "language" },
  { keyword: "zig", category: "language" },
  { keyword: "bash", category: "language" },
  { keyword: "r", category: "language" },
  { keyword: "julia", category: "language" },
  { keyword: "scala", category: "language" },
  { keyword: "elixir", category: "language" },
  { keyword: "clojure", category: "language" },
  { keyword: "haskell", category: "language" },
  { keyword: "erlang", category: "language" },
  { keyword: "nim", category: "language" },
  { keyword: "react", category: "frontend" },
  { keyword: "vue", category: "frontend" },
  { keyword: "angular", category: "frontend" },
  { keyword: "svelte", category: "frontend" },
  { keyword: "solidjs", category: "frontend" },
  { keyword: "preact", category: "frontend" },
  { keyword: "htmx", category: "frontend" },
  { keyword: "alpinejs", category: "frontend" },
  { keyword: "nextjs", category: "frontend" },
  { keyword: "nuxt", category: "frontend" },
  { keyword: "astro", category: "frontend" },
  { keyword: "remix", category: "frontend" },
  { keyword: "tailwindcss", category: "frontend" },
  { keyword: "bootstrap", category: "frontend" },
  { keyword: "material-ui", category: "frontend" },
  { keyword: "shadcn-ui", category: "frontend" },
  { keyword: "radix-ui", category: "frontend" },
  { keyword: "ant-design", category: "frontend" },
  { keyword: "styled-components", category: "frontend" },
  { keyword: "sass", category: "frontend" },
  { keyword: "postcss", category: "frontend" },
  { keyword: "zustand", category: "frontend" },
  { keyword: "pinia", category: "frontend" },
  { keyword: "storybook", category: "frontend" },
  { keyword: "docusaurus", category: "frontend" },
  { keyword: "lit", category: "frontend" },
  { keyword: "express", category: "backend" },
  { keyword: "fastify", category: "backend" },
  { keyword: "koa", category: "backend" },
  { keyword: "hapi", category: "backend" },
  { keyword: "nestjs", category: "backend" },
  { keyword: "spring-boot", category: "backend" },
  { keyword: "django", category: "backend" },
  { keyword: "flask", category: "backend" },
  { keyword: "fastapi", category: "backend" },
  { keyword: "gin", category: "backend" },
  { keyword: "fiber", category: "backend" },
  { keyword: "actix-web", category: "backend" },
  { keyword: "rocket", category: "backend" },
  { keyword: "axum", category: "backend" },
  { keyword: "rails", category: "backend" },
  { keyword: "laravel", category: "backend" },
  { keyword: "symfony", category: "backend" },
  { keyword: "phoenix", category: "backend" },
  { keyword: "graphql", category: "backend" },
  { keyword: "trpc", category: "backend" },
  { keyword: "grpc", category: "backend" },
  { keyword: "socket.io", category: "backend" },
  { keyword: "hasura", category: "backend" },
  { keyword: "supabase", category: "backend" },
  { keyword: "micronaut", category: "backend" },
  { keyword: "aiohttp", category: "backend" },
  { keyword: "echo", category: "backend" },
  { keyword: "tensorflow", category: "ai-ml" },
  { keyword: "pytorch", category: "ai-ml" },
  { keyword: "keras", category: "ai-ml" },
  { keyword: "huggingface", category: "ai-ml" },
  { keyword: "transformers", category: "ai-ml" },
  { keyword: "langchain", category: "ai-ml" },
  { keyword: "llama-index", category: "ai-ml" },
  { keyword: "openai", category: "ai-ml" },
  { keyword: "ollama", category: "ai-ml" },
  { keyword: "stable-diffusion", category: "ai-ml" },
  { keyword: "whisper", category: "ai-ml" },
  { keyword: "opencv", category: "ai-ml" },
  { keyword: "yolo", category: "ai-ml" },
  { keyword: "scikit-learn", category: "ai-ml" },
  { keyword: "pandas", category: "ai-ml" },
  { keyword: "numpy", category: "ai-ml" },
  { keyword: "xgboost", category: "ai-ml" },
  { keyword: "lightgbm", category: "ai-ml" },
  { keyword: "jax", category: "ai-ml" },
  { keyword: "ray", category: "ai-ml" },
  { keyword: "mlflow", category: "ai-ml" },
  { keyword: "kubeflow", category: "ai-ml" },
  { keyword: "chroma", category: "ai-ml" },
  { keyword: "weaviate", category: "ai-ml" },
  { keyword: "qdrant", category: "ai-ml" },
  { keyword: "mistral", category: "ai-ml" },
  { keyword: "deepseek", category: "ai-ml" },
  { keyword: "vllm", category: "ai-ml" },
  { keyword: "llama-cpp", category: "ai-ml" },
  { keyword: "comfyui", category: "ai-ml" },
  { keyword: "phi", category: "ai-ml" },
  { keyword: "postgresql", category: "database" },
  { keyword: "mysql", category: "database" },
  { keyword: "sqlite", category: "database" },
  { keyword: "mongodb", category: "database" },
  { keyword: "redis", category: "database" },
  { keyword: "elasticsearch", category: "database" },
  { keyword: "clickhouse", category: "database" },
  { keyword: "cockroachdb", category: "database" },
  { keyword: "timescaledb", category: "database" },
  { keyword: "influxdb", category: "database" },
  { keyword: "neo4j", category: "database" },
  { keyword: "planetscale", category: "database" },
  { keyword: "neon", category: "database" },
  { keyword: "turso", category: "database" },
  { keyword: "meilisearch", category: "database" },
  { keyword: "prisma", category: "database" },
  { keyword: "drizzle", category: "database" },
  { keyword: "valkey", category: "database" },
  { keyword: "typeorm", category: "database" },
  { keyword: "dgraph", category: "database" },
  { keyword: "opensearch", category: "database" },
  { keyword: "typesense", category: "database" },
  { keyword: "kubernetes", category: "devops" },
  { keyword: "docker", category: "devops" },
  { keyword: "podman", category: "devops" },
  { keyword: "terraform", category: "devops" },
  { keyword: "opentofu", category: "devops" },
  { keyword: "pulumi", category: "devops" },
  { keyword: "ansible", category: "devops" },
  { keyword: "helm", category: "devops" },
  { keyword: "kustomize", category: "devops" },
  { keyword: "istio", category: "devops" },
  { keyword: "nginx", category: "devops" },
  { keyword: "caddy", category: "devops" },
  { keyword: "traefik", category: "devops" },
  { keyword: "prometheus", category: "devops" },
  { keyword: "grafana", category: "devops" },
  { keyword: "loki", category: "devops" },
  { keyword: "tempo", category: "devops" },
  { keyword: "opentelemetry", category: "devops" },
  { keyword: "jaeger", category: "devops" },
  { keyword: "sentry", category: "devops" },
  { keyword: "github-actions", category: "devops" },
  { keyword: "gitlab-ci", category: "devops" },
  { keyword: "jenkins", category: "devops" },
  { keyword: "argo", category: "devops" },
  { keyword: "flux", category: "devops" },
  { keyword: "vault", category: "devops" },
  { keyword: "consul", category: "devops" },
  { keyword: "packer", category: "devops" },
  { keyword: "vagrant", category: "devops" },
  { keyword: "crossplane", category: "devops" },
  { keyword: "kind", category: "devops" },
  { keyword: "minikube", category: "devops" },
  { keyword: "k3s", category: "devops" },
  { keyword: "docker-compose", category: "devops" },
  { keyword: "systemd", category: "devops" },
  { keyword: "flutter", category: "mobile" },
  { keyword: "react-native", category: "mobile" },
  { keyword: "expo", category: "mobile" },
  { keyword: "electron", category: "desktop" },
  { keyword: "tauri", category: "desktop" },
  { keyword: "swiftui", category: "mobile" },
  { keyword: "jetpack-compose", category: "mobile" },
  { keyword: "kotlin-multiplatform", category: "mobile" },
  { keyword: "capacitor", category: "mobile" },
  { keyword: "vite", category: "tools" },
  { keyword: "webpack", category: "tools" },
  { keyword: "esbuild", category: "tools" },
  { keyword: "rollup", category: "tools" },
  { keyword: "bun", category: "tools" },
  { keyword: "swc", category: "tools" },
  { keyword: "babel", category: "tools" },
  { keyword: "eslint", category: "tools" },
  { keyword: "prettier", category: "tools" },
  { keyword: "pnpm", category: "tools" },
  { keyword: "yarn", category: "tools" },
  { keyword: "nx", category: "tools" },
  { keyword: "turborepo", category: "tools" },
  { keyword: "zod", category: "tools" },
  { keyword: "sharp", category: "tools" },
  { keyword: "puppeteer", category: "tools" },
  { keyword: "playwright", category: "tools" },
  { keyword: "tsx", category: "tools" },
  { keyword: "dayjs", category: "tools" },
  { keyword: "swr", category: "tools" },
  { keyword: "husky", category: "tools" },
  { keyword: "lint-staged", category: "tools" },
  { keyword: "rxjs", category: "tools" },
  { keyword: "biome", category: "tools" },
  { keyword: "ruff", category: "tools" },
  { keyword: "sqlc", category: "tools" },
  { keyword: "obsidian", category: "tools" },
  { keyword: "jest", category: "testing" },
  { keyword: "vitest", category: "testing" },
  { keyword: "cypress", category: "testing" },
  { keyword: "testing-library", category: "testing" },
  { keyword: "mocha", category: "testing" },
  { keyword: "jasmine", category: "testing" },
  { keyword: "k6", category: "testing" },
  { keyword: "selenium", category: "testing" },
  { keyword: "karma", category: "testing" },
  { keyword: "kafka", category: "data" },
  { keyword: "apache-spark", category: "data" },
  { keyword: "apache-flink", category: "data" },
  { keyword: "apache-airflow", category: "data" },
  { keyword: "dbt", category: "data" },
  { keyword: "dagster", category: "data" },
  { keyword: "prefect", category: "data" },
  { keyword: "duckdb", category: "data" },
  { keyword: "polars", category: "data" },
  { keyword: "delta-lake", category: "data" },
  { keyword: "iceberg", category: "data" },
  { keyword: "trino", category: "data" },
  { keyword: "metabase", category: "data" },
  { keyword: "superset", category: "data" },
  { keyword: "great-expectations", category: "data" },
  { keyword: "debezium", category: "data" },
  { keyword: "kafka-connect", category: "data" },
  { keyword: "datahub", category: "data" },
  { keyword: "materialize", category: "data" },
  { keyword: "ethereum", category: "blockchain" },
  { keyword: "solana", category: "blockchain" },
  { keyword: "hardhat", category: "blockchain" },
  { keyword: "foundry", category: "blockchain" },
  { keyword: "openzeppelin", category: "blockchain" },
  { keyword: "godot", category: "gamedev" },
  { keyword: "unity", category: "gamedev" },
  { keyword: "bevy", category: "gamedev" },
  { keyword: "raylib", category: "gamedev" },
  { keyword: "threejs", category: "gamedev" },
  { keyword: "pixi", category: "gamedev" },
  { keyword: "playcanvas", category: "gamedev" },
  { keyword: "webassembly", category: "general" },
  { keyword: "webgpu", category: "general" },
  { keyword: "ebpf", category: "general" },
  { keyword: "llm", category: "general" },
  { keyword: "rag", category: "general" },
  { keyword: "agent", category: "general" },
  { keyword: "vector-database", category: "general" },
  { keyword: "cybersecurity", category: "general" },
  { keyword: "neovim", category: "general" },
  { keyword: "distributed-systems", category: "general" },
];

async function seedKeywords(): Promise<void> {
  for (let i = 0; i < SEED_KEYWORDS.length; i += 50) {
    const batch = SEED_KEYWORDS.slice(i, i + 50);
    const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(",");
    const params = batch.flatMap(k => [k.keyword, k.category]);
    await pool.query(
      `INSERT INTO keywords (keyword, category) VALUES ${values} ON CONFLICT (keyword) DO NOTHING`,
      params
    );
  }
}

export async function runMigrations(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS keywords (
        id SERIAL PRIMARY KEY,
        keyword VARCHAR(255) UNIQUE NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'general',
        is_active BOOLEAN DEFAULT true,
        times_scanned INT DEFAULT 0,
        last_scanned_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(is_active) WHERE is_active = true`);

    await seedKeywords();

    await pool.query(`
      ALTER TABLE repositories
      ADD COLUMN IF NOT EXISTS open_issues INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS license VARCHAR(100),
      ADD COLUMN IF NOT EXISTS latest_release VARCHAR(255),
      ADD COLUMN IF NOT EXISTS languages JSONB,
      ADD COLUMN IF NOT EXISTS topics JSONB,
      ADD COLUMN IF NOT EXISTS homepage_url VARCHAR(512),
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS disk_usage INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS stars_24h INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS stars_7d INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS score NUMERIC(12,2) DEFAULT 0
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_snapshots (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        stars INT NOT NULL,
        forks INT NOT NULL,
        open_issues INT NOT NULL,
        collected_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repositories_score ON repositories(score DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repositories_stars_24h ON repositories(stars_24h DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repositories_stars_7d ON repositories(stars_7d DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_snapshots_repo_collected ON repository_snapshots(repository_id, collected_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_snapshots_collected ON repository_snapshots(collected_at)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        phone VARCHAR(50),
        company VARCHAR(255),
        country VARCHAR(100),
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        email_verified BOOLEAN DEFAULT false,
        verification_token VARCHAR(255),
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token_encrypted TEXT`);
    await pool.query(`UPDATE users SET name = 'Unknown' WHERE name IS NULL`);
    await pool.query(`ALTER TABLE users ALTER COLUMN name SET NOT NULL`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_repositories (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        full_name VARCHAR(512) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, repository_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_repositories_user ON user_repositories(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_repositories_repo ON user_repositories(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_verification ON users(verification_token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_reset ON users(password_reset_token)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`);

    // Repository commits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_commits (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        sha VARCHAR(40) NOT NULL,
        message TEXT,
        author_name VARCHAR(255),
        author_email VARCHAR(255),
        author_date TIMESTAMP,
        url VARCHAR(512),
        collected_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repository_id, sha)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repository_commits_repo ON repository_commits(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repository_commits_date ON repository_commits(author_date)`);

    // Pull Requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_pull_requests (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        github_pr_id BIGINT UNIQUE,
        number INT,
        title TEXT,
        state VARCHAR(20),
        author_login VARCHAR(255),
        author_avatar VARCHAR(512),
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        closed_at TIMESTAMP,
        merged_at TIMESTAMP,
        mergeable VARCHAR(20),
        additions INT DEFAULT 0,
        deletions INT DEFAULT 0,
        changed_files INT DEFAULT 0,
        reviewers JSONB DEFAULT '[]'::jsonb,
        labels JSONB DEFAULT '[]'::jsonb,
        head_branch VARCHAR(255),
        base_branch VARCHAR(255),
        url VARCHAR(512),
        collected_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pr_repo ON repository_pull_requests(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pr_state ON repository_pull_requests(state)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pr_created ON repository_pull_requests(created_at)`);

    // Issues table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_issues (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        github_issue_id BIGINT UNIQUE,
        number INT,
        title TEXT,
        state VARCHAR(20),
        author_login VARCHAR(255),
        author_avatar VARCHAR(512),
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        closed_at TIMESTAMP,
        labels JSONB DEFAULT '[]'::jsonb,
        assignees JSONB DEFAULT '[]'::jsonb,
        milestone VARCHAR(255),
        comments_count INT DEFAULT 0,
        url VARCHAR(512),
        collected_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_repo ON repository_issues(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_state ON repository_issues(state)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_created ON repository_issues(created_at)`);

    // Branches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_branches (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        is_default BOOLEAN DEFAULT false,
        is_protected BOOLEAN DEFAULT false,
        last_commit_sha VARCHAR(40),
        last_commit_message TEXT,
        last_commit_author VARCHAR(255),
        last_commit_date TIMESTAMP,
        has_open_pr BOOLEAN DEFAULT false,
        collected_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repository_id, name)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_repo ON repository_branches(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_default ON repository_branches(is_default)`);

    // Releases table (full history)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_releases (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        github_release_id BIGINT UNIQUE,
        tag_name VARCHAR(255),
        name VARCHAR(512),
        body TEXT,
        author_login VARCHAR(255),
        created_at TIMESTAMP,
        published_at TIMESTAMP,
        is_prerelease BOOLEAN DEFAULT false,
        is_draft BOOLEAN DEFAULT false,
        url VARCHAR(512),
        collected_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_release_repo ON repository_releases(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_release_published ON repository_releases(published_at)`);

    // Activity log (consolidated events)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repository_activity (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        event_type VARCHAR(50),
        actor_login VARCHAR(255),
        actor_avatar VARCHAR(512),
        event_data JSONB,
        created_at TIMESTAMP,
        collected_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_repo ON repository_activity(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_type ON repository_activity(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_date ON repository_activity(created_at)`);

    // Scan history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repo_scan_history (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        scanned_at TIMESTAMP DEFAULT NOW(),
        duration_ms INT,
        status VARCHAR(20) DEFAULT 'success',
        commits_found INT DEFAULT 0,
        prs_opened INT DEFAULT 0,
        prs_merged INT DEFAULT 0,
        prs_closed INT DEFAULT 0,
        issues_opened INT DEFAULT 0,
        issues_closed INT DEFAULT 0,
        branches_count INT DEFAULT 0,
        releases_found INT DEFAULT 0,
        stars INT DEFAULT 0,
        forks INT DEFAULT 0,
        stars_delta_24h INT DEFAULT 0,
        score NUMERIC(12,2) DEFAULT 0,
        error_message TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_repo ON repo_scan_history(repository_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_date ON repo_scan_history(scanned_at)`);

    // Reset users for dev
    await pool.query("TRUNCATE TABLE users CASCADE");

    console.log("[db] Migrations applied successfully");
  } catch (err) {
    console.error("[db] Migration failed:", err);
  }
}

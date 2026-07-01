-- Crear tabla de búsquedas
CREATE TABLE IF NOT EXISTS searches (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL UNIQUE,
  search_count INT DEFAULT 1,
  last_searched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de repositorios
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(512) NOT NULL,
  description TEXT,
  url VARCHAR(512),
  owner VARCHAR(255),
  stars INT DEFAULT 0,
  forks INT DEFAULT 0,
  watchers INT DEFAULT 0,
  open_issues INT DEFAULT 0,
  license VARCHAR(100),
  latest_release VARCHAR(255),
  languages JSONB,
  topics JSONB,
  homepage_url VARCHAR(512),
  is_archived BOOLEAN DEFAULT false,
  disk_usage INT DEFAULT 0,
  language VARCHAR(50),
  created_at TIMESTAMP,
  pushed_at TIMESTAMP,
  collected_at TIMESTAMP DEFAULT NOW(),
  stars_24h INT DEFAULT 0,
  stars_7d INT DEFAULT 0,
  score NUMERIC(12,2) DEFAULT 0
);

-- Crear tabla de relación search-repository
CREATE TABLE IF NOT EXISTS search_repository (
  id SERIAL PRIMARY KEY,
  search_id INT NOT NULL REFERENCES searches(id),
  repository_id INT NOT NULL REFERENCES repositories(id),
  relevance_score DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(search_id, repository_id)
);

-- Crear tabla de keywords rotativas
CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  times_scanned INT DEFAULT 0,
  last_scanned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);
CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(is_active) WHERE is_active = true;

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_searches_keyword ON searches(keyword);
CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language);
CREATE INDEX IF NOT EXISTS idx_repositories_score ON repositories(score DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_stars_24h ON repositories(stars_24h DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_stars_7d ON repositories(stars_7d DESC);
CREATE INDEX IF NOT EXISTS idx_search_repository_search ON search_repository(search_id);

CREATE TABLE IF NOT EXISTS repository_snapshots (
  id SERIAL PRIMARY KEY,
  repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  stars INT NOT NULL,
  forks INT NOT NULL,
  open_issues INT NOT NULL,
  collected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_repo_collected ON repository_snapshots(repository_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_collected ON repository_snapshots(collected_at);
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
  language VARCHAR(50),
  created_at TIMESTAMP,
  pushed_at TIMESTAMP,
  collected_at TIMESTAMP DEFAULT NOW()
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

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_searches_keyword ON searches(keyword);
CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language);
CREATE INDEX IF NOT EXISTS idx_search_repository_search ON search_repository(search_id);
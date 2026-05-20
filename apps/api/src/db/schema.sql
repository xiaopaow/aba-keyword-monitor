CREATE TABLE IF NOT EXISTS import_task (
  id BIGSERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  report_date DATE NOT NULL,
  total_rows BIGINT DEFAULT 0,
  processed_rows BIGINT DEFAULT 0,
  success_rows BIGINT DEFAULT 0,
  failed_rows BIGINT DEFAULT 0,
  duplicate_rows BIGINT DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aba_keyword_daily (
  id BIGSERIAL PRIMARY KEY,
  keyword VARCHAR(500) NOT NULL,
  rank_num INT NOT NULL,
  report_date DATE NOT NULL,
  source VARCHAR(50) DEFAULT 'lingxing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_keyword_date UNIQUE(keyword, report_date)
);

CREATE INDEX IF NOT EXISTS idx_aba_keyword_daily_date ON aba_keyword_daily(report_date);
CREATE INDEX IF NOT EXISTS idx_aba_keyword_daily_keyword ON aba_keyword_daily(keyword);
CREATE INDEX IF NOT EXISTS idx_aba_keyword_daily_rank ON aba_keyword_daily(rank_num);

CREATE TABLE IF NOT EXISTS keyword_profile (
  id BIGSERIAL PRIMARY KEY,
  keyword VARCHAR(500) NOT NULL UNIQUE,
  first_seen_date DATE,
  last_seen_date DATE,
  best_rank INT,
  worst_rank INT,
  tag VARCHAR(100),
  note TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keyword_alert (
  id BIGSERIAL PRIMARY KEY,
  keyword VARCHAR(500) NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  alert_level VARCHAR(20) NOT NULL,
  current_rank INT,
  compare_rank INT,
  rank_change INT,
  alert_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'unhandled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_keyword_alert_date ON keyword_alert(alert_date);
CREATE INDEX IF NOT EXISTS idx_keyword_alert_status ON keyword_alert(status);

CREATE TABLE IF NOT EXISTS keyword_tag (
  id BIGSERIAL PRIMARY KEY,
  keyword VARCHAR(500) NOT NULL,
  tag_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_keyword_tag UNIQUE(keyword, tag_name)
);

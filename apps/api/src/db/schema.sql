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

CREATE TABLE IF NOT EXISTS aba_weekly_report (
  id BIGSERIAL PRIMARY KEY,
  marketplace_id VARCHAR(50) NOT NULL DEFAULT 'ATVPDKIKX0DER',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_period VARCHAR(20) NOT NULL DEFAULT 'WEEK',
  source VARCHAR(50) NOT NULL DEFAULT 'crawler',
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_aba_weekly_report UNIQUE(marketplace_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_aba_weekly_report_period ON aba_weekly_report(period_start DESC, period_end DESC);

CREATE TABLE IF NOT EXISTS aba_search_term_weekly (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES aba_weekly_report(id) ON DELETE CASCADE,
  marketplace_id VARCHAR(50) NOT NULL DEFAULT 'ATVPDKIKX0DER',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  department_name VARCHAR(255),
  search_term VARCHAR(500) NOT NULL,
  search_frequency_rank INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_aba_search_term_weekly UNIQUE(report_id, search_term)
);

CREATE INDEX IF NOT EXISTS idx_aba_search_term_weekly_period_rank ON aba_search_term_weekly(period_start DESC, search_frequency_rank ASC);
CREATE INDEX IF NOT EXISTS idx_aba_search_term_weekly_search_term ON aba_search_term_weekly(search_term);
CREATE INDEX IF NOT EXISTS idx_aba_search_term_weekly_rank ON aba_search_term_weekly(search_frequency_rank);

CREATE TABLE IF NOT EXISTS aba_search_term_product (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES aba_weekly_report(id) ON DELETE CASCADE,
  search_term VARCHAR(500) NOT NULL,
  clicked_asin VARCHAR(50),
  clicked_item_name TEXT,
  click_share_rank INT,
  click_share NUMERIC(12, 6),
  conversion_share NUMERIC(12, 6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_aba_search_term_product UNIQUE(report_id, search_term, click_share_rank, clicked_asin)
);

CREATE INDEX IF NOT EXISTS idx_aba_search_term_product_report_term ON aba_search_term_product(report_id, search_term);
CREATE INDEX IF NOT EXISTS idx_aba_search_term_product_asin ON aba_search_term_product(clicked_asin);

-- Upgrade an existing invutility database for "one page at a time" on Trip Sheet - Bill Details.
-- Run once on the server's database before deploying this version (after the earlier upgrade-*.sql files).
-- A new database gets this table from invutility-create.sql.
CREATE TABLE IF NOT EXISTS trip_sheet_lock (
  ts_code    INT          NOT NULL PRIMARY KEY,
  lock_id    VARCHAR(40)  NOT NULL,
  user_code  INT          DEFAULT NULL,
  username   VARCHAR(50)  DEFAULT NULL,
  locked_at  DATETIME     NOT NULL,
  seen_at    DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

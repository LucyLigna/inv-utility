-- Upgrade an existing invutility database for "one page at a time" in Trip Sheet - Bill Details and
-- Trip Route Wise Customers. Run once on the server's database before deploying this version (after the earlier
-- upgrade-*.sql files). A new database gets this table from invutility-create.sql.
CREATE TABLE IF NOT EXISTS record_lock (
  lock_type  VARCHAR(30)  NOT NULL,
  record_id  VARCHAR(40)  NOT NULL,
  lock_id    VARCHAR(40)  NOT NULL,
  user_code  INT          DEFAULT NULL,
  username   VARCHAR(50)  DEFAULT NULL,
  locked_at  DATETIME     NOT NULL,
  seen_at    DATETIME     NOT NULL,
  PRIMARY KEY (lock_type, record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replaced by record_lock (it only ever held temporary locks)
DROP TABLE IF EXISTS trip_sheet_lock;

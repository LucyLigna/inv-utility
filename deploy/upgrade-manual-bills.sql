-- Upgrade an existing invutility database for manual bills on Trip Sheet - Bill Details.
-- Run once on the server's database before deploying this version (after upgrade-delivery.sql and
-- upgrade-bills-complete.sql). A new database gets these columns from invutility-create.sql.
-- Manual bills are stored in salesdetails (sm_slno 'M000000001'...): from now on, never truncate salesdetails.
ALTER TABLE salesdetails
  ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER inp_dt_tm,
  ADD COLUMN cu_company_code VARCHAR(3) DEFAULT NULL AFTER is_manual,
  ADD COLUMN cu_ba_code VARCHAR(4) DEFAULT NULL AFTER cu_company_code,
  ADD COLUMN manual_by INT DEFAULT NULL AFTER cu_ba_code;

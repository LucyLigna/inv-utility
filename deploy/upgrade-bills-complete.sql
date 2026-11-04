-- Upgrade an existing invutility database for "Mark Complete" on Trip Sheet - Bill Details.
-- Run once on the server's database before deploying this version (after upgrade-delivery.sql).
-- A new database gets these columns from invutility-create.sql.
ALTER TABLE trip_sheet
  ADD COLUMN bills_completed_at DATETIME DEFAULT NULL AFTER driver_pin_till,
  ADD COLUMN bills_completed_by INT DEFAULT NULL AFTER bills_completed_at;

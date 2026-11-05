-- Upgrade an existing invutility database for marking a delivery on the driver page without scanning.
-- Run once on the server's database before deploying this version (after the earlier upgrade-*.sql files).
-- A new database gets this column from invutility-create.sql.
ALTER TABLE trip_sheet_delivery
  ADD COLUMN method ENUM('Scan','Manual') NOT NULL DEFAULT 'Scan' AFTER driver_code;

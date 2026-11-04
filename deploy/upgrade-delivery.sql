-- Upgrade an existing invutility database for the bill date (smd_date) and driver delivery scanning.
-- Run once on the server's database before deploying this version (a new database gets these from
-- invutility-create.sql). Each statement fails harmlessly with "Duplicate column / key" if already applied.

-- Bill date from the INV API
ALTER TABLE salesdetails ADD COLUMN smd_date DATE DEFAULT NULL AFTER smc_no, ADD KEY idx_salesdetails_smd_date (smd_date);

-- The driver logs in to the delivery page (/driver) with this mobile number
ALTER TABLE driver ADD COLUMN mobile VARCHAR(15) NULL AFTER short_code, ADD UNIQUE KEY uq_driver_mobile (mobile);

-- The trip sheet's 4-digit driver code and when it is active
ALTER TABLE trip_sheet
  ADD COLUMN driver_pin CHAR(4) DEFAULT NULL AFTER total_pack_qty,
  ADD COLUMN driver_pin_from DATETIME DEFAULT NULL AFTER driver_pin,
  ADD COLUMN driver_pin_till DATETIME DEFAULT NULL AFTER driver_pin_from;

-- Customers the driver has scanned as delivered
CREATE TABLE IF NOT EXISTS trip_sheet_delivery (
  ts_code      INT          NOT NULL,
  company_code VARCHAR(3)   NOT NULL,
  ba_code      VARCHAR(4)   NOT NULL,
  cu_code      VARCHAR(8)   NOT NULL,
  delivered_at DATETIME     NOT NULL,
  driver_code  INT          NOT NULL,
  latitude     DECIMAL(10,7) DEFAULT NULL,
  longitude    DECIMAL(10,7) DEFAULT NULL,
  accuracy_m   INT          DEFAULT NULL,
  PRIMARY KEY (ts_code, company_code, ba_code, cu_code),
  CONSTRAINT fk_trip_sheet_delivery_sheet FOREIGN KEY (ts_code) REFERENCES trip_sheet (ts_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

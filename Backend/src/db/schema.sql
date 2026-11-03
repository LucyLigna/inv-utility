-- Main menu (top level): Master, Transaction ...
CREATE TABLE IF NOT EXISTS sys_menufile (
  menu_code   VARCHAR(10)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lowest level menu items (programs/screens) under a main menu
CREATE TABLE IF NOT EXISTS sys_programfile (
  program_code VARCHAR(10)  NOT NULL PRIMARY KEY,
  menu_code    VARCHAR(10)  NOT NULL,
  name         VARCHAR(100) NOT NULL,
  route        VARCHAR(200) NOT NULL,
  sort_order   INT          NOT NULL DEFAULT 0,
  status       ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_program_menu FOREIGN KEY (menu_code) REFERENCES sys_menufile (menu_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehiclenumber (
  code        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  number      VARCHAR(20)  NOT NULL,
  make        VARCHAR(100) NOT NULL,
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vehicle_number (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver (
  code        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  short_code  VARCHAR(10)  NULL,
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_driver_name (name),
  UNIQUE KEY uq_driver_short_code (short_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trip_route (
  code        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  short_code  VARCHAR(10)  NOT NULL,
  -- Days the route runs, e.g. 'MON,THU'
  weekdays    SET('MON','TUE','WED','THU','FRI','SAT') NOT NULL DEFAULT '',
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trip_route_name (name),
  UNIQUE KEY uq_trip_route_short_code (short_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Branches a trip route serves. Unticking a branch marks it Inactive rather than deleting it.
CREATE TABLE IF NOT EXISTS trip_route_branches (
  trip_code    INT        NOT NULL,
  company_code VARCHAR(3) NOT NULL,
  ba_code      CHAR(4)    NOT NULL,
  status       ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at   TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (trip_code, company_code, ba_code),
  CONSTRAINT fk_trip_route_branches_route FOREIGN KEY (trip_code) REFERENCES trip_route (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customers on a trip route, in visiting order. A 'Sub' row belongs to the nearest 'Main' row above it
-- (customers with the same GST number or mobile, grouped under one main customer).
CREATE TABLE IF NOT EXISTS trip_route_customers (
  trip_code    INT        NOT NULL,
  company_code VARCHAR(3) NOT NULL,
  ba_code      CHAR(4)    NOT NULL,
  cu_code      VARCHAR(8) NOT NULL,
  main_sub     ENUM('Main','Sub') NOT NULL DEFAULT 'Main',
  sort_order   INT        NOT NULL,
  remarks      VARCHAR(255) DEFAULT NULL, -- main customers only
  created_at   TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trip_code, company_code, ba_code, cu_code),
  KEY ix_trip_route_customers_order (trip_code, sort_order),
  CONSTRAINT fk_trip_route_customers_route FOREIGN KEY (trip_code) REFERENCES trip_route (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trip sheets. tsc_no is the document number, generated on save as TS-000001, TS-000002, ...
CREATE TABLE IF NOT EXISTS trip_sheet (
  ts_code      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tsc_no       VARCHAR(20)  NOT NULL,
  entry_date   DATE         NOT NULL,
  trip_code    INT          NOT NULL,
  driver_code  INT          NOT NULL,
  loading_date DATE         DEFAULT NULL,
  start_date   DATE         DEFAULT NULL,
  end_date     DATE         DEFAULT NULL,
  remarks      VARCHAR(500) DEFAULT NULL,
  -- Deleting a sheet only marks it Cancelled, so its number is never reused
  status       ENUM('Active','Cancelled') NOT NULL DEFAULT 'Active',
  cancelled_at DATETIME     DEFAULT NULL,
  -- Totals of the bills in trip_sheet_bills, updated when the bill details are saved
  total_bills    INT        NOT NULL DEFAULT 0,
  total_pack_qty INT        NOT NULL DEFAULT 0,
  inp_dt_tm    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trip_sheet_no (tsc_no),
  CONSTRAINT fk_trip_sheet_route FOREIGN KEY (trip_code) REFERENCES trip_route (code),
  CONSTRAINT fk_trip_sheet_driver FOREIGN KEY (driver_code) REFERENCES driver (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bills (from salesdetails) carried on a trip sheet. A bill can be on only one Active trip sheet.
CREATE TABLE IF NOT EXISTS trip_sheet_bills (
  ts_code      INT           NOT NULL,
  company_code VARCHAR(3)    NOT NULL,
  ba_code      VARCHAR(4)    NOT NULL,
  sm_slno      VARCHAR(10)   NOT NULL,
  pack_qty     INT           DEFAULT NULL,
  amount       DECIMAL(12,2) DEFAULT NULL,
  -- Delivery order on this sheet (customers in the order arranged on the screen, their bills together)
  sort_order   INT           DEFAULT NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ts_code, company_code, ba_code, sm_slno),
  KEY ix_trip_sheet_bills_bill (company_code, ba_code, sm_slno),
  CONSTRAINT fk_trip_sheet_bills_sheet FOREIGN KEY (ts_code) REFERENCES trip_sheet (ts_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sys_menufile (menu_code, name, sort_order) VALUES
  ('M01', 'Master', 1),
  ('M02', 'Transaction', 2);

INSERT IGNORE INTO sys_programfile (program_code, menu_code, name, route, sort_order) VALUES
  ('P0101', 'M01', 'Vehicle', '/master/vehicle', 1),
  ('P0102', 'M01', 'Driver', '/master/driver', 2),
  ('P0103', 'M01', 'Trip Route', '/master/trip-route', 3),
  ('P0201', 'M02', 'Trip Route Wise Customers', '/transaction/trip-route-customers', 1),
  ('P0202', 'M02', 'Trip Sheet', '/transaction/trip-sheet', 2),
  ('P0203', 'M02', 'Trip Sheet - Bill Details', '/transaction/trip-sheet-bills', 3);

-- ---------------------------------------------------------------------------
-- Data pulled from the INV API (192.168.3.24) by the scheduler in src/sync
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company (
  company_code VARCHAR(3)  NOT NULL,
  coc_desc     VARCHAR(40) NOT NULL,
  coc_add1     VARCHAR(40) DEFAULT NULL,
  coc_add2     VARCHAR(40) DEFAULT NULL,
  coc_add3     VARCHAR(40) DEFAULT NULL,
  coc_add4     VARCHAR(40) DEFAULT NULL,
  email        VARCHAR(40) DEFAULT NULL,
  -- Kept locally; not part of the INV API data, so the daily sync leaves it alone
  short_code   VARCHAR(10) DEFAULT NULL,
  PRIMARY KEY (company_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch (
  company_code VARCHAR(3)  NOT NULL,
  ba_code      CHAR(4)     NOT NULL,
  brc_desc     VARCHAR(40) NOT NULL,
  brc_alias    VARCHAR(8)  NOT NULL,
  brc_add1     VARCHAR(40) DEFAULT NULL,
  brc_add2     VARCHAR(40) DEFAULT NULL,
  brc_add3     VARCHAR(40) DEFAULT NULL,
  brc_add4     VARCHAR(40) DEFAULT NULL,
  brc_status   CHAR(1)     DEFAULT 'Y',
  brc_link     VARCHAR(50) DEFAULT NULL,
  last_update  DATETIME    DEFAULT NULL,
  brc_ho       VARCHAR(1)  DEFAULT 'N',
  link_yn      VARCHAR(1)  DEFAULT 'Y',
  PRIMARY KEY (company_code, ba_code),
  UNIQUE KEY branch_brcdesc_uk (company_code, brc_desc),
  UNIQUE KEY branch_brcalias_uk (company_code, brc_alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer (
  company_code    VARCHAR(3)    NOT NULL,
  cu_code         VARCHAR(8)    NOT NULL,
  sa_code         CHAR(4)       DEFAULT NULL,
  cuc_desc        VARCHAR(40)   NOT NULL,
  cuc_alias       VARCHAR(15)   NOT NULL,
  cuc_add1        VARCHAR(40)   DEFAULT NULL,
  cuc_add2        VARCHAR(40)   DEFAULT NULL,
  cuc_add3        VARCHAR(40)   DEFAULT NULL,
  cuc_add4        VARCHAR(40)   DEFAULT NULL,
  cuc_pincode     VARCHAR(6)    DEFAULT NULL,
  cuc_mobile      VARCHAR(25)   DEFAULT NULL,
  tr_code         CHAR(4)       NOT NULL,
  ba_code         CHAR(4)       NOT NULL,
  cun_creditlimit DECIMAL(12,2) DEFAULT 0,
  avg_sales       DECIMAL(12,2) DEFAULT NULL,
  avg_coll        DECIMAL(12,2) DEFAULT NULL,
  avg_days        DECIMAL(6,2)  DEFAULT NULL,
  outstanding     DECIMAL(12,2) DEFAULT NULL,
  over_due        DECIMAL(12,2) DEFAULT NULL,
  cuc_status      CHAR(1)       DEFAULT 'Y',
  cud_eddate      DATETIME      DEFAULT NULL,
  new_cucode      VARCHAR(8)    DEFAULT NULL,
  main_cucode     VARCHAR(10)   DEFAULT NULL,
  main_cucname    VARCHAR(40)   DEFAULT NULL,
  account_code    VARCHAR(6)    DEFAULT NULL,
  cuc_place       VARCHAR(40)   DEFAULT NULL,
  gst_number      VARCHAR(20)   DEFAULT NULL,
  PRIMARY KEY (company_code, ba_code, cu_code),
  UNIQUE KEY customer_cucalias_uk (company_code, ba_code, cuc_alias),
  UNIQUE KEY customer_cucdesc_uk (company_code, ba_code, cuc_desc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS territory (
  company_code VARCHAR(3)  NOT NULL,
  tr_code      CHAR(4)     NOT NULL,
  trc_desc     VARCHAR(30) NOT NULL,
  trc_alias    VARCHAR(8)  NOT NULL,
  weekday      TINYINT     DEFAULT NULL,
  ro_code      CHAR(4)     NOT NULL,
  trc_status   CHAR(1)     DEFAULT 'Y',
  inp_dt_tm    DATETIME    DEFAULT NULL,
  PRIMARY KEY (company_code, tr_code),
  UNIQUE KEY territory_trcdesc_uk (company_code, trc_desc),
  UNIQUE KEY territory_trcalias_uk (company_code, trc_alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route (
  company_code VARCHAR(3)  NOT NULL,
  ro_code      CHAR(4)     NOT NULL,
  roc_desc     VARCHAR(30) NOT NULL,
  roc_alias    VARCHAR(8)  NOT NULL,
  se_code      CHAR(4)     NOT NULL,
  ba_code      CHAR(4)     NOT NULL,
  roc_status   CHAR(1)     DEFAULT 'Y',
  inp_dt_tm    DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_code, ro_code),
  UNIQUE KEY route_rocdesc_uk (company_code, roc_desc),
  UNIQUE KEY route_rocalias_uk (company_code, roc_alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salesexecutive (
  company_code   VARCHAR(3)  NOT NULL,
  se_code        CHAR(4)     NOT NULL,
  sec_desc       VARCHAR(30) NOT NULL,
  sec_alias      VARCHAR(8)  NOT NULL,
  sec_status     CHAR(1)     DEFAULT 'Y',
  us_code        CHAR(4)     DEFAULT NULL,
  inp_dt_tm      DATETIME    DEFAULT CURRENT_TIMESTAMP,
  executive_type VARCHAR(1)  DEFAULT NULL,
  emc_alias      VARCHAR(8)  DEFAULT NULL,
  ba_code        VARCHAR(4)  DEFAULT NULL,
  PRIMARY KEY (company_code, se_code),
  UNIQUE KEY salesexe_secalias_uk (company_code, sec_alias),
  UNIQUE KEY salesexe_secdesc_uk (company_code, sec_desc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salesdetails (
  company_code     VARCHAR(3)    NOT NULL,
  ba_code          VARCHAR(4)    NOT NULL,
  sm_slno          VARCHAR(10)   NOT NULL,
  cu_code          VARCHAR(8)    DEFAULT NULL,
  cuc_desc         VARCHAR(100)  DEFAULT NULL,
  roc_desc         VARCHAR(40)   DEFAULT NULL,
  smc_no           VARCHAR(20)   DEFAULT NULL,
  tp_code          VARCHAR(4)    DEFAULT NULL,
  tpc_desc         VARCHAR(40)   DEFAULT NULL,
  transporter_type VARCHAR(20)   DEFAULT NULL,
  net_amount       DECIMAL(12,2) DEFAULT NULL,
  pack_qty         INT           DEFAULT NULL,
  eway_billno      VARCHAR(20)   DEFAULT NULL,
  checked_ok       VARCHAR(1)    DEFAULT NULL,
  printed          VARCHAR(3)    DEFAULT NULL,
  inp_dt_tm        DATETIME      DEFAULT NULL,
  PRIMARY KEY (company_code, ba_code, sm_slno),
  KEY idx_salesdetails_cu (company_code, ba_code, cu_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Branch picker list: 'BAD - CAL UNIT I' (company short code - branch name)
CREATE OR REPLACE VIEW view_branch_list AS
SELECT company.company_code, branch.ba_code,
       CONCAT(company.short_code, ' - ', branch.brc_desc) AS company_branch,
       CONCAT(company.short_code, ' - ', branch.brc_alias) AS company_branch_code,
       company.coc_desc, branch.brc_desc
FROM branch JOIN company ON company.company_code = branch.company_code;

-- Customer search list with company, branch, territory, route and sales executive names
CREATE OR REPLACE VIEW view_customer_list AS
SELECT company.coc_desc AS company_name, branch.brc_desc AS branch_name,
       CONCAT(company.short_code, ' - ', branch.brc_desc) AS company_branch,
       CONCAT(company.short_code, ' - ', branch.brc_alias) AS company_branch_code,
       territory.trc_desc AS terriotry_name, territory.ro_code, route.roc_desc AS route_name, route.se_code,
       salesexecutive.sec_desc AS salesexecutive_name,
       customer.company_code, customer.cu_code, customer.sa_code, customer.cuc_desc, customer.cuc_alias,
       customer.cuc_add1, customer.cuc_add2, customer.cuc_add3, customer.cuc_add4, customer.cuc_pincode,
       customer.cuc_mobile, customer.tr_code, customer.ba_code, customer.cun_creditlimit, customer.avg_sales,
       customer.avg_coll, customer.avg_days, customer.outstanding, customer.over_due, customer.cuc_status,
       customer.cud_eddate, customer.new_cucode, customer.main_cucode, customer.main_cucname,
       customer.account_code, customer.cuc_place, customer.gst_number
FROM customer
JOIN branch ON branch.ba_code = customer.ba_code AND branch.company_code = customer.company_code
JOIN company ON company.company_code = customer.company_code
JOIN territory ON territory.tr_code = customer.tr_code AND territory.company_code = customer.company_code
JOIN route ON route.ro_code = territory.ro_code AND territory.company_code = route.company_code
JOIN salesexecutive ON salesexecutive.se_code = route.se_code AND salesexecutive.company_code = route.company_code;

-- One row per scheduler run, for checking that the syncs are working
CREATE TABLE IF NOT EXISTS sync_log (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job         VARCHAR(30)  NOT NULL,
  started_at  DATETIME     NOT NULL,
  finished_at DATETIME     DEFAULT NULL,
  status      ENUM('Running','Success','Failed') NOT NULL DEFAULT 'Running',
  batches     INT          NOT NULL DEFAULT 0,
  row_count   INT          NOT NULL DEFAULT 0,
  message     VARCHAR(1000) DEFAULT NULL,
  KEY ix_sync_log_job (job, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rows the scheduler could not save (kept so data the API has already handed out is never lost)
CREATE TABLE IF NOT EXISTS sync_failed_row (
  id         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job        VARCHAR(30)   NOT NULL,
  payload    JSON          NOT NULL,
  error      VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

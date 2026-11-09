-- Upgrade an existing invutility database for Branch Wise Bill Marking (and branches per user in Users).
-- Run once on the server's database before deploying this version (after the earlier upgrade-*.sql files).
CREATE TABLE IF NOT EXISTS sys_user_branches (
  user_code    INT        NOT NULL,
  company_code VARCHAR(3) NOT NULL,
  ba_code      VARCHAR(4) NOT NULL,
  created_by   INT        DEFAULT NULL,
  updated_by   INT        DEFAULT NULL,
  PRIMARY KEY (user_code, company_code, ba_code),
  CONSTRAINT fk_user_branches_user FOREIGN KEY (user_code) REFERENCES sys_users (user_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sys_programfile (program_code, menu_code, name, route, sort_order)
VALUES ('P0204', 'M02', 'Branch Wise Bill Marking', '/transaction/branch-bill-marking', 4);

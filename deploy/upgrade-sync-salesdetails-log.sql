-- Upgrade an existing invutility database: every salesdetails sync run stores each bill it received
-- (company_code, ba_code, sm_slno, net_amount, pack_qty) against its run in sync_log (sync_id = sync_log.id).
-- Run once on the server's database before deploying this version (after the earlier upgrade-*.sql files).
-- A new database gets this table from invutility-create.sql.
CREATE TABLE IF NOT EXISTS `sync_salesdetails_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sync_id` int NOT NULL,
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sm_slno` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `net_amount` decimal(12,2) DEFAULT NULL,
  `pack_qty` int DEFAULT NULL,
  `received_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_sync_salesdetails_log_sync` (`sync_id`),
  KEY `ix_sync_salesdetails_log_bill` (`company_code`,`ba_code`,`sm_slno`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Creates the invutility database for INV Utility on a new MySQL 8 server.
-- Generated from the live database on 2026-11-03 by: npm run db:script
-- Run it as a user that may create databases, e.g.:  mysql -u root -p < invutility-create.sql
-- Safe to run again: existing tables and rows are left as they are.

CREATE DATABASE IF NOT EXISTS `invutility` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- In case the database already existed with the server default collation
ALTER DATABASE `invutility` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `invutility`;

-- branch
CREATE TABLE IF NOT EXISTS `branch` (
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `brc_desc` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `brc_alias` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `brc_add1` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brc_add2` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brc_add3` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brc_add4` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brc_status` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Y',
  `brc_link` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `brc_ho` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'N',
  `link_yn` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Y',
  PRIMARY KEY (`company_code`,`ba_code`),
  UNIQUE KEY `branch_brcdesc_uk` (`company_code`,`brc_desc`),
  UNIQUE KEY `branch_brcalias_uk` (`company_code`,`brc_alias`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- company
CREATE TABLE IF NOT EXISTS `company` (
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `coc_desc` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `coc_add1` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coc_add2` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coc_add3` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coc_add4` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `short_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`company_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- customer
CREATE TABLE IF NOT EXISTS `customer` (
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cu_code` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sa_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_desc` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cuc_alias` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cuc_add1` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_add2` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_add3` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_add4` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_pincode` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_mobile` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tr_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cun_creditlimit` decimal(12,2) DEFAULT '0.00',
  `avg_sales` decimal(12,2) DEFAULT NULL,
  `avg_coll` decimal(12,2) DEFAULT NULL,
  `avg_days` decimal(6,2) DEFAULT NULL,
  `outstanding` decimal(12,2) DEFAULT NULL,
  `over_due` decimal(12,2) DEFAULT NULL,
  `cuc_status` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Y',
  `cud_eddate` datetime DEFAULT NULL,
  `new_cucode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `main_cucode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `main_cucname` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_code` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_place` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gst_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`company_code`,`ba_code`,`cu_code`),
  UNIQUE KEY `customer_cucalias_uk` (`company_code`,`ba_code`,`cuc_alias`),
  UNIQUE KEY `customer_cucdesc_uk` (`company_code`,`ba_code`,`cuc_desc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- driver
CREATE TABLE IF NOT EXISTS `driver` (
  `code` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Active','Inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`),
  UNIQUE KEY `uq_driver_name` (`name`),
  UNIQUE KEY `uq_driver_short_code` (`short_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- route
CREATE TABLE IF NOT EXISTS `route` (
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ro_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `roc_desc` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `roc_alias` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `se_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `roc_status` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Y',
  `inp_dt_tm` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_code`,`ro_code`),
  UNIQUE KEY `route_rocdesc_uk` (`company_code`,`roc_desc`),
  UNIQUE KEY `route_rocalias_uk` (`company_code`,`roc_alias`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- salesdetails
CREATE TABLE IF NOT EXISTS `salesdetails` (
  `company_code` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sm_slno` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cu_code` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuc_desc` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roc_desc` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `smc_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tp_code` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tpc_desc` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transporter_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `net_amount` decimal(12,2) DEFAULT NULL,
  `pack_qty` int DEFAULT NULL,
  `eway_billno` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `checked_ok` varchar(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `printed` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inp_dt_tm` datetime DEFAULT NULL,
  PRIMARY KEY (`company_code`,`ba_code`,`sm_slno`),
  KEY `idx_salesdetails_cu` (`company_code`,`ba_code`,`cu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- salesexecutive
CREATE TABLE IF NOT EXISTS `salesexecutive` (
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `se_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sec_desc` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sec_alias` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sec_status` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Y',
  `us_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inp_dt_tm` datetime DEFAULT CURRENT_TIMESTAMP,
  `executive_type` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emc_alias` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ba_code` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`company_code`,`se_code`),
  UNIQUE KEY `salesexe_secalias_uk` (`company_code`,`sec_alias`),
  UNIQUE KEY `salesexe_secdesc_uk` (`company_code`,`sec_desc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sync_failed_row
CREATE TABLE IF NOT EXISTS `sync_failed_row` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` json NOT NULL,
  `error` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sync_log
CREATE TABLE IF NOT EXISTS `sync_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  `status` enum('Running','Success','Failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Running',
  `batches` int NOT NULL DEFAULT '0',
  `row_count` int NOT NULL DEFAULT '0',
  `message` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_sync_log_job` (`job`,`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sys_menufile
CREATE TABLE IF NOT EXISTS `sys_menufile` (
  `menu_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` enum('Active','Inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`menu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sys_programfile
CREATE TABLE IF NOT EXISTS `sys_programfile` (
  `program_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `menu_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` enum('Active','Inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`program_code`),
  KEY `fk_program_menu` (`menu_code`),
  CONSTRAINT `fk_program_menu` FOREIGN KEY (`menu_code`) REFERENCES `sys_menufile` (`menu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- territory
CREATE TABLE IF NOT EXISTS `territory` (
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tr_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `trc_desc` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `trc_alias` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `weekday` tinyint DEFAULT NULL,
  `ro_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `trc_status` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Y',
  `inp_dt_tm` datetime DEFAULT NULL,
  PRIMARY KEY (`company_code`,`tr_code`),
  UNIQUE KEY `territory_trcdesc_uk` (`company_code`,`trc_desc`),
  UNIQUE KEY `territory_trcalias_uk` (`company_code`,`trc_alias`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- trip_route
CREATE TABLE IF NOT EXISTS `trip_route` (
  `code` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `weekdays` set('MON','TUE','WED','THU','FRI','SAT') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` enum('Active','Inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`),
  UNIQUE KEY `uq_trip_route_name` (`name`),
  UNIQUE KEY `uq_trip_route_short_code` (`short_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- trip_route_branches
CREATE TABLE IF NOT EXISTS `trip_route_branches` (
  `trip_code` int NOT NULL,
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Active','Inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`trip_code`,`company_code`,`ba_code`),
  CONSTRAINT `fk_trip_route_branches_route` FOREIGN KEY (`trip_code`) REFERENCES `trip_route` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- trip_route_customers
CREATE TABLE IF NOT EXISTS `trip_route_customers` (
  `trip_code` int NOT NULL,
  `company_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cu_code` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `main_sub` enum('Main','Sub') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Main',
  `sort_order` int NOT NULL,
  `remarks` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`trip_code`,`company_code`,`ba_code`,`cu_code`),
  KEY `ix_trip_route_customers_order` (`trip_code`,`sort_order`),
  CONSTRAINT `fk_trip_route_customers_route` FOREIGN KEY (`trip_code`) REFERENCES `trip_route` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- trip_sheet
CREATE TABLE IF NOT EXISTS `trip_sheet` (
  `ts_code` int NOT NULL AUTO_INCREMENT,
  `tsc_no` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entry_date` date NOT NULL,
  `trip_code` int NOT NULL,
  `driver_code` int NOT NULL,
  `loading_date` date DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `remarks` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Active','Cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `cancelled_at` datetime DEFAULT NULL,
  `total_bills` int NOT NULL DEFAULT '0',
  `total_pack_qty` int NOT NULL DEFAULT '0',
  `inp_dt_tm` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ts_code`),
  UNIQUE KEY `uq_trip_sheet_no` (`tsc_no`),
  KEY `fk_trip_sheet_route` (`trip_code`),
  KEY `fk_trip_sheet_driver` (`driver_code`),
  CONSTRAINT `fk_trip_sheet_driver` FOREIGN KEY (`driver_code`) REFERENCES `driver` (`code`),
  CONSTRAINT `fk_trip_sheet_route` FOREIGN KEY (`trip_code`) REFERENCES `trip_route` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- trip_sheet_bills
CREATE TABLE IF NOT EXISTS `trip_sheet_bills` (
  `ts_code` int NOT NULL,
  `company_code` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_code` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sm_slno` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pack_qty` int DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ts_code`,`company_code`,`ba_code`,`sm_slno`),
  KEY `ix_trip_sheet_bills_bill` (`company_code`,`ba_code`,`sm_slno`),
  CONSTRAINT `fk_trip_sheet_bills_sheet` FOREIGN KEY (`ts_code`) REFERENCES `trip_sheet` (`ts_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- vehiclenumber
CREATE TABLE IF NOT EXISTS `vehiclenumber` (
  `code` int NOT NULL AUTO_INCREMENT,
  `number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `make` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Active','Inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`),
  UNIQUE KEY `uq_vehicle_number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- view_branch_list
CREATE OR REPLACE VIEW `view_branch_list` AS select `company`.`company_code` AS `company_code`,`branch`.`ba_code` AS `ba_code`,concat(`company`.`short_code`,' - ',`branch`.`brc_desc`) AS `company_branch`,`company`.`coc_desc` AS `coc_desc`,`branch`.`brc_desc` AS `brc_desc` from (`branch` join `company` on((`company`.`company_code` = `branch`.`company_code`)));

-- view_customer_list
CREATE OR REPLACE VIEW `view_customer_list` AS select `company`.`coc_desc` AS `company_name`,`branch`.`brc_desc` AS `branch_name`,concat(`company`.`short_code`,' - ',`branch`.`brc_desc`) AS `company_branch`,`territory`.`trc_desc` AS `terriotry_name`,`territory`.`ro_code` AS `ro_code`,`route`.`roc_desc` AS `route_name`,`route`.`se_code` AS `se_code`,`salesexecutive`.`sec_desc` AS `salesexecutive_name`,`customer`.`company_code` AS `company_code`,`customer`.`cu_code` AS `cu_code`,`customer`.`sa_code` AS `sa_code`,`customer`.`cuc_desc` AS `cuc_desc`,`customer`.`cuc_alias` AS `cuc_alias`,`customer`.`cuc_add1` AS `cuc_add1`,`customer`.`cuc_add2` AS `cuc_add2`,`customer`.`cuc_add3` AS `cuc_add3`,`customer`.`cuc_add4` AS `cuc_add4`,`customer`.`cuc_pincode` AS `cuc_pincode`,`customer`.`cuc_mobile` AS `cuc_mobile`,`customer`.`tr_code` AS `tr_code`,`customer`.`ba_code` AS `ba_code`,`customer`.`cun_creditlimit` AS `cun_creditlimit`,`customer`.`avg_sales` AS `avg_sales`,`customer`.`avg_coll` AS `avg_coll`,`customer`.`avg_days` AS `avg_days`,`customer`.`outstanding` AS `outstanding`,`customer`.`over_due` AS `over_due`,`customer`.`cuc_status` AS `cuc_status`,`customer`.`cud_eddate` AS `cud_eddate`,`customer`.`new_cucode` AS `new_cucode`,`customer`.`main_cucode` AS `main_cucode`,`customer`.`main_cucname` AS `main_cucname`,`customer`.`account_code` AS `account_code`,`customer`.`cuc_place` AS `cuc_place`,`customer`.`gst_number` AS `gst_number` from (((((`customer` join `branch` on(((`branch`.`ba_code` = `customer`.`ba_code`) and (`branch`.`company_code` = `customer`.`company_code`)))) join `company` on((`company`.`company_code` = `customer`.`company_code`))) join `territory` on(((`territory`.`tr_code` = `customer`.`tr_code`) and (`territory`.`company_code` = `customer`.`company_code`)))) join `route` on(((`route`.`ro_code` = `territory`.`ro_code`) and (`territory`.`company_code` = `route`.`company_code`)))) join `salesexecutive` on(((`salesexecutive`.`se_code` = `route`.`se_code`) and (`salesexecutive`.`company_code` = `route`.`company_code`))));

-- sys_menufile rows
INSERT IGNORE INTO `sys_menufile` (`menu_code`, `name`, `sort_order`, `status`) VALUES
  ('M01', 'Master', 1, 'Active'),
  ('M02', 'Transaction', 2, 'Active');

-- sys_programfile rows
INSERT IGNORE INTO `sys_programfile` (`program_code`, `menu_code`, `name`, `route`, `sort_order`, `status`) VALUES
  ('P0101', 'M01', 'Vehicle', '/master/vehicle', 1, 'Active'),
  ('P0102', 'M01', 'Driver', '/master/driver', 2, 'Active'),
  ('P0103', 'M01', 'Trip Route', '/master/trip-route', 3, 'Active'),
  ('P0201', 'M02', 'Trip Route Wise Customers', '/transaction/trip-route-customers', 1, 'Active'),
  ('P0202', 'M02', 'Trip Sheet', '/transaction/trip-sheet', 2, 'Active'),
  ('P0203', 'M02', 'Trip Sheet - Bill Details', '/transaction/trip-sheet-bills', 3, 'Active');

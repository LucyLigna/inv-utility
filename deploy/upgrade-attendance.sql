-- Sample: employee attendance by face scan on a shared phone / tablet (Attendance menu).
-- Run once on the server's database before deploying this version (after the earlier upgrade-*.sql files).
-- A new database gets these from invutility-create.sql.
--
-- No photos are stored: only face descriptors (128 numbers each) worked out on the device.

CREATE TABLE IF NOT EXISTS att_employee (
  code        INT          NOT NULL AUTO_INCREMENT,
  emp_no      VARCHAR(20)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  department  VARCHAR(100) DEFAULT NULL,
  mobile      VARCHAR(10)  DEFAULT NULL,
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_by  INT          DEFAULT NULL,
  updated_by  INT          DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  UNIQUE KEY uq_att_employee_emp_no (emp_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Face samples taken in Employee > Enrol Face (several per employee)
CREATE TABLE IF NOT EXISTS att_employee_face (
  id          INT       NOT NULL AUTO_INCREMENT,
  emp_code    INT       NOT NULL,
  descriptor  JSON      NOT NULL,
  created_by  INT       DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_att_employee_face_emp (emp_code),
  CONSTRAINT fk_att_employee_face_emp FOREIGN KEY (emp_code) REFERENCES att_employee (code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each scan: In for the first of the day, then Out / In in turn. distance = how close the face matched (lower = closer)
CREATE TABLE IF NOT EXISTS att_punch (
  id          INT          NOT NULL AUTO_INCREMENT,
  emp_code    INT          NOT NULL,
  punch_at    DATETIME     NOT NULL,
  punch_type  ENUM('In','Out') NOT NULL,
  distance    DECIMAL(5,3) DEFAULT NULL,
  user_code   INT          DEFAULT NULL COMMENT 'user logged in on the kiosk',
  device      VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY ix_att_punch_emp (emp_code, punch_at),
  KEY ix_att_punch_at (punch_at),
  CONSTRAINT fk_att_punch_emp FOREIGN KEY (emp_code) REFERENCES att_employee (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sys_menufile (menu_code, name, sort_order, status) VALUES ('M04', 'Attendance', 4, 'Active');
INSERT IGNORE INTO sys_programfile (program_code, menu_code, name, route, sort_order) VALUES
  ('P0401', 'M04', 'Employee', '/attendance/employee', 1),
  ('P0402', 'M04', 'Attendance Kiosk', '/attendance/kiosk', 2),
  ('P0403', 'M04', 'Attendance Report', '/attendance/report', 3);

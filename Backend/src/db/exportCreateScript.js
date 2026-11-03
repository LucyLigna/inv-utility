// Writes deploy/invutility-create.sql: a script that creates the whole invutility database on a new MySQL server.
// It is taken from the live database (tables, views and menu rows), so it always matches what is in use.
//   npm run db:script
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const OUT_FILE = path.join(__dirname, '..', '..', '..', 'deploy', 'invutility-create.sql');
// Tables whose rows are part of the set-up (the menu); everything else starts empty
const DATA_TABLES = ['sys_menufile', 'sys_programfile'];
// Every table and the database use this collation
const COLLATION = 'utf8mb4_unicode_ci';

// Foreign keys from schema.sql. A MyISAM table drops them silently, so they are added here when the live
// table doesn't show them; every table in the script is created as InnoDB, which keeps them.
const FOREIGN_KEYS = {
  sys_programfile: ['CONSTRAINT `fk_program_menu` FOREIGN KEY (`menu_code`) REFERENCES `sys_menufile` (`menu_code`)'],
  trip_route_branches: ['CONSTRAINT `fk_trip_route_branches_route` FOREIGN KEY (`trip_code`) REFERENCES `trip_route` (`code`)'],
  trip_route_customers: ['CONSTRAINT `fk_trip_route_customers_route` FOREIGN KEY (`trip_code`) REFERENCES `trip_route` (`code`)'],
  trip_sheet: [
    'CONSTRAINT `fk_trip_sheet_route` FOREIGN KEY (`trip_code`) REFERENCES `trip_route` (`code`)',
    'CONSTRAINT `fk_trip_sheet_driver` FOREIGN KEY (`driver_code`) REFERENCES `driver` (`code`)',
  ],
};
const referencedTable = (fk) => fk.match(/REFERENCES `(\w+)`/)[1];

// Adds any of the table's foreign keys that the live definition is missing, before its closing bracket
function withForeignKeys(table, sql) {
  const missing = (FOREIGN_KEYS[table] || []).filter((fk) => !sql.includes(fk.match(/CONSTRAINT `(\w+)`/)[0]));
  if (!missing.length) return sql;
  return sql.replace(/\n\)( ENGINE=)/, `,\n  ${missing.join(',\n  ')}\n)$1`);
}

// Tables in an order where every table comes after the tables its foreign keys point to
function orderByForeignKeys(tables, refs) {
  const ordered = [];
  const visit = (t, seen = new Set()) => {
    if (ordered.includes(t) || seen.has(t)) return;
    seen.add(t);
    (refs[t] || []).forEach((r) => visit(r, seen));
    ordered.push(t);
  };
  tables.forEach((t) => visit(t));
  return ordered;
}

async function main() {
  const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
  const [objects] = await pool.query(
    'SELECT TABLE_NAME name, TABLE_TYPE type FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [db]
  );
  const [fks] = await pool.query(
    `SELECT TABLE_NAME t, REFERENCED_TABLE_NAME r FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL AND REFERENCED_TABLE_NAME <> TABLE_NAME`,
    [db]
  );
  const refs = {};
  fks.forEach(({ t, r }) => (refs[t] ||= []).push(r));
  Object.entries(FOREIGN_KEYS).forEach(([t, list]) => list.forEach((fk) => (refs[t] ||= []).push(referencedTable(fk))));

  const tables = orderByForeignKeys(objects.filter((o) => o.type === 'BASE TABLE').map((o) => o.name), refs);
  const views = objects.filter((o) => o.type === 'VIEW').map((o) => o.name);

  const out = [
    `-- Creates the ${db} database for INV Utility on a new MySQL 8 server.`,
    `-- Generated from the live database on ${new Date().toISOString().slice(0, 10)} by: npm run db:script`,
    '-- Run it as a user that may create databases, e.g.:  mysql -u root -p < invutility-create.sql',
    '-- Safe to run again: existing tables and rows are left as they are.',
    '',
    `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE ${COLLATION};`,
    '-- In case the database already existed with the server default collation',
    `ALTER DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE ${COLLATION};`,
    `USE \`${db}\`;`,
    '',
  ];

  for (const t of tables) {
    const [[row]] = await pool.query(`SHOW CREATE TABLE \`${t}\``);
    const sql = row['Create Table']
      .replace(/^CREATE TABLE/, 'CREATE TABLE IF NOT EXISTS')
      .replace(/ AUTO_INCREMENT=\d+/, '') // start numbering from 1 on the new server
      .replace(/ ENGINE=\w+/, ' ENGINE=InnoDB') // transactions and foreign keys need InnoDB
      // one collation everywhere; mixing them breaks joins ("Illegal mix of collations")
      .replaceAll(/utf8mb4_0900_ai_ci/g, COLLATION);
    out.push(`-- ${t}`, `${withForeignKeys(t, sql)};`, '');
  }

  for (const v of views) {
    const [[row]] = await pool.query(`SHOW CREATE VIEW \`${v}\``);
    const sql = row['Create View']
      .replace(/^CREATE .*?VIEW/, 'CREATE OR REPLACE VIEW') // drop DEFINER, so any user can run the script
      .replaceAll(`\`${db}\`.`, ''); // no database name inside, in case it is created under another name
    out.push(`-- ${v}`, `${sql};`, '');
  }

  for (const t of DATA_TABLES) {
    const [rows] = await pool.query(`SELECT * FROM \`${t}\``);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).filter((c) => !['created_at', 'updated_at'].includes(c));
    out.push(`-- ${t} rows`, `INSERT IGNORE INTO \`${t}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES`);
    out.push(`${rows.map((r) => `  (${cols.map((c) => pool.escape(r[c])).join(', ')})`).join(',\n')};`, '');
  }

  fs.writeFileSync(OUT_FILE, out.join('\n'));
  console.log(`Wrote ${OUT_FILE}: ${tables.length} tables, ${views.length} views, menu rows from ${DATA_TABLES.join(', ')}`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.code || '', err.sqlMessage || err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

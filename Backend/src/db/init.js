// Creates the tables and seeds the menus: npm run db:init
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
  await conn.query(`USE \`${process.env.DB_NAME}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log(`Database "${process.env.DB_NAME}" is ready.`);
  await conn.end();
})().catch((err) => {
  console.error('DB init failed:', err.code || '', err.sqlMessage || err.message || err);
  process.exit(1);
});

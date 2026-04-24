const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'meal',
  user: process.env.DB_USER || 'RohitRohit',
  password: process.env.DB_PASSWORD || 'RohitRohit',
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('✅ PostgreSQL database connected successfully.');
  release();
});

// Initialize tables if they don't exist
const initDB = async () => {
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(20) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createAdminsTable = `
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(20) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(createClientsTable);
    await pool.query(createAdminsTable);
    
    // Add columns if they do not exist
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);
    
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);

    console.log('✅ Database tables initialized with necessary columns.');

    // Create default admin if not exists (for testing/demo)
    const adminCheck = await pool.query('SELECT * FROM admins LIMIT 1');
    if (adminCheck.rows.length === 0) {
      await pool.query('INSERT INTO admins (phone_number, password) VALUES ($1, $2)', ['+911234567890', 'adminpassword']);
      console.log('✅ Default admin inserted: +911234567890 / adminpassword');
    }
  } catch (err) {
    console.error('Error initializing database tables', err);
  }
};

module.exports = {
  pool,
  initDB,
  query: (text, params) => pool.query(text, params),
};

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
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
  // ──────────────────────────────────────────────
  // EXISTING TABLES
  // ──────────────────────────────────────────────
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS clients (
      id            SERIAL PRIMARY KEY,
      phone_number  VARCHAR(20) UNIQUE NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createAdminsTable = `
    CREATE TABLE IF NOT EXISTS admins (
      id            SERIAL PRIMARY KEY,
      phone_number  VARCHAR(20) UNIQUE NOT NULL,
      password      VARCHAR(255) NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // SCHOOLS TABLE
  // ──────────────────────────────────────────────
  const createSchoolsTable = `
    CREATE TABLE IF NOT EXISTS schools (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(255) UNIQUE NOT NULL,
      address         TEXT NOT NULL,
      city            VARCHAR(100) NOT NULL,
      state           VARCHAR(100) NOT NULL,
      pincode         VARCHAR(20) NOT NULL,
      country         VARCHAR(100) NOT NULL DEFAULT 'India',
      is_active       BOOLEAN NOT NULL DEFAULT true,
      is_deleted      BOOLEAN NOT NULL DEFAULT false,
      created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      updated_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // MEAL SIZES TABLE (Fixed: Small, Medium, Large)
  // ──────────────────────────────────────────────
  const createMealSizesTable = `
    CREATE TABLE IF NOT EXISTS meal_sizes (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(50) UNIQUE NOT NULL,
      display_name  VARCHAR(100) NOT NULL,
      sort_order    SMALLINT NOT NULL DEFAULT 0,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // STANDARDS TABLE (Fixed: 1st to 12th)
  // ──────────────────────────────────────────────
  const createStandardsTable = `
    CREATE TABLE IF NOT EXISTS standards (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(20) UNIQUE NOT NULL,
      display_name   VARCHAR(100) NOT NULL,
      numeric_value  SMALLINT NOT NULL,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    // Create core tables
    await pool.query(createClientsTable);
    await pool.query(createAdminsTable);

    // Add columns to existing tables if they do not exist
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);

    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);

    // Create new feature tables
    await pool.query(createSchoolsTable);
    await pool.query(createMealSizesTable);
    await pool.query(createStandardsTable);

    // Migration: Add 'address' column if it doesn't exist (in case table was created with old schema)
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS address TEXT;`);
    // Drop old columns if they exist
    await pool.query(`ALTER TABLE schools DROP COLUMN IF EXISTS address_line1;`);
    await pool.query(`ALTER TABLE schools DROP COLUMN IF EXISTS address_line2;`);
    await pool.query(`ALTER TABLE schools DROP COLUMN IF EXISTS contact_email;`);
    await pool.query(`ALTER TABLE schools DROP COLUMN IF EXISTS contact_phone;`);
    await pool.query(`ALTER TABLE schools DROP COLUMN IF EXISTS principal_name;`);

    // Ensure address is NOT NULL if it was just added (might need a default or manual data fix if data exists)
    // For now, just making sure it's there.
    
    console.log('✅ Database tables initialized successfully.');

    // ──────────────────────────────────────────────
    // SEED: Default Admin
    // ──────────────────────────────────────────────
    const adminCheck = await pool.query('SELECT id FROM admins LIMIT 1');
    if (adminCheck.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('adminpassword', salt);
      await pool.query(
        'INSERT INTO admins (phone_number, password) VALUES ($1, $2)',
        ['+911234567890', hashedPassword]
      );
      console.log('✅ Default admin seeded: +911234567890 / adminpassword');
    }

    // ──────────────────────────────────────────────
    // SEED: Meal Sizes (Small, Medium, Large)
    // ──────────────────────────────────────────────
    const mealSizesCheck = await pool.query('SELECT id FROM meal_sizes LIMIT 1');
    if (mealSizesCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO meal_sizes (name, display_name, sort_order) VALUES
          ('small',  'Small',  1),
          ('medium', 'Medium', 2),
          ('large',  'Large',  3)
        ON CONFLICT (name) DO NOTHING;
      `);
      console.log('✅ Meal sizes seeded: Small, Medium, Large');
    }

    // ──────────────────────────────────────────────
    // SEED: Standards (1st to 12th)
    // ──────────────────────────────────────────────
    const standardsCheck = await pool.query('SELECT id FROM standards LIMIT 1');
    if (standardsCheck.rows.length === 0) {
      const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
      const standardValues = ordinals
        .map((ord, i) => `('${ord}', '${ord} Standard', ${i + 1})`)
        .join(',\n          ');

      await pool.query(`
        INSERT INTO standards (name, display_name, numeric_value) VALUES
          ${standardValues}
        ON CONFLICT (name) DO NOTHING;
      `);
      console.log('✅ Standards seeded: 1st to 12th');
    }

  } catch (err) {
    console.error('❌ Error initializing database tables:', err);
    throw err;
  }
};

module.exports = {
  pool,
  initDB,
  query: (text, params) => pool.query(text, params),
};

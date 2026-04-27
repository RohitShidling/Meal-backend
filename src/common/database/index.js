const { Pool } = require('pg');
const bcrypt = require('bcrypt');
process.env.DOTENVX_QUIET = '1';
require('dotenv').config({ quiet: true });

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
  console.log('PostgreSQL database connected successfully.');
  release();
});

// Initialize tables if they don't exist
const initDB = async () => {
  // ──────────────────────────────────────────────
  // SEQUENCES FOR CUSTOM IDs
  // ──────────────────────────────────────────────
  const createSequences = `
    CREATE SEQUENCE IF NOT EXISTS school_id_seq;
    CREATE SEQUENCE IF NOT EXISTS client_id_seq;
    CREATE SEQUENCE IF NOT EXISTS child_id_seq;
    CREATE SEQUENCE IF NOT EXISTS menu_id_seq;
    CREATE SEQUENCE IF NOT EXISTS subscription_id_seq;
    CREATE SEQUENCE IF NOT EXISTS corporate_location_id_seq;
    CREATE SEQUENCE IF NOT EXISTS professional_id_seq;
    CREATE SEQUENCE IF NOT EXISTS parent_id_seq;
    CREATE SEQUENCE IF NOT EXISTS teacher_id_seq;
  `;

  // ──────────────────────────────────────────────
  // CORE TABLES
  // ──────────────────────────────────────────────
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS clients (
      id            VARCHAR(20) PRIMARY KEY DEFAULT 'P-' || nextval('client_id_seq')::TEXT,
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
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'SH-' || nextval('school_id_seq')::TEXT,
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
  // CHILDREN TABLE
  // ──────────────────────────────────────────────
  const createChildrenTable = `
    CREATE TABLE IF NOT EXISTS children (
      id               VARCHAR(20) PRIMARY KEY DEFAULT 'CH-' || nextval('child_id_seq')::TEXT,
      parent_id        VARCHAR(20) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name             VARCHAR(255) NOT NULL,
      roll_number      VARCHAR(50) NOT NULL,
      school_id        VARCHAR(20) NOT NULL REFERENCES schools(id),
      standard_id      INTEGER NOT NULL REFERENCES standards(id),
      meal_size_id     INTEGER NOT NULL REFERENCES meal_sizes(id),
      meal_time        TIME NOT NULL,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

  const createDailyMenusTable = `
    CREATE TABLE IF NOT EXISTS daily_menus (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'MN-' || nextval('menu_id_seq')::TEXT,
      image_url       TEXT NOT NULL,
      image_public_id TEXT,
      items           TEXT,
      menu_date       DATE NOT NULL DEFAULT CURRENT_DATE,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // SUBSCRIPTIONS TABLE
  // ──────────────────────────────────────────────
  const createSubscriptionsTable = `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'SUB-' || nextval('subscription_id_seq')::TEXT,
      plan_name       VARCHAR(255) NOT NULL,
      price           DECIMAL(10, 2) NOT NULL,
      billing_cycle   VARCHAR(50) NOT NULL,
      trial_days      INTEGER NOT NULL DEFAULT 0,
      display_order   INTEGER NOT NULL DEFAULT 1,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      updated_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // CORPORATE LOCATIONS TABLE (Admin managed)
  // ──────────────────────────────────────────────
  const createCorporateLocationsTable = `
    CREATE TABLE IF NOT EXISTS corporate_locations (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'CL-' || nextval('corporate_location_id_seq')::TEXT,
      name            VARCHAR(255) NOT NULL,
      address         TEXT NOT NULL,
      city            VARCHAR(100) NOT NULL,
      state           VARCHAR(100) NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // PROFESSIONAL PROFILES TABLE
  // ──────────────────────────────────────────────
  const createProfessionalProfilesTable = `
    CREATE TABLE IF NOT EXISTS professional_profiles (
      id                    VARCHAR(20) PRIMARY KEY DEFAULT 'PRO-' || nextval('professional_id_seq')::TEXT,
      client_id             VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name                  VARCHAR(255) NOT NULL,
      company_name          VARCHAR(255) NOT NULL,
      corporate_location_id VARCHAR(20) NOT NULL REFERENCES corporate_locations(id),
      city                  VARCHAR(100) NOT NULL,
      state                 VARCHAR(100) NOT NULL,
      lunch_time            TIME NOT NULL,
      created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // PARENT PROFILES TABLE
  // ──────────────────────────────────────────────
  const createParentProfilesTable = `
    CREATE TABLE IF NOT EXISTS parent_profiles (
      id          VARCHAR(20) PRIMARY KEY DEFAULT 'PAR-' || nextval('parent_id_seq')::TEXT,
      client_id   VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name        VARCHAR(255) NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // TEACHER PROFILES TABLE
  // ──────────────────────────────────────────────
  const createTeacherProfilesTable = `
    CREATE TABLE IF NOT EXISTS teacher_profiles (
      id                  VARCHAR(20) PRIMARY KEY DEFAULT 'TCH-' || nextval('teacher_id_seq')::TEXT,
      client_id           VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name                VARCHAR(255) NOT NULL,
      school_college_name VARCHAR(255) NOT NULL,
      city                VARCHAR(100) NOT NULL,
      state               VARCHAR(100) NOT NULL,
      location            TEXT NOT NULL,
      status              VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    // 1. Drop existing tables if they use old integer IDs (Migration Step)
    const tableChecks = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('clients', 'schools') AND column_name = 'id';
    `);

    let shouldReset = false;
    tableChecks.rows.forEach(row => {
      if (row.data_type === 'integer') shouldReset = true;
    });

    if (shouldReset) {
      console.log('Old integer IDs detected. Resetting tables for custom ID formats (SH-X, P-X)...');
      await pool.query('DROP TABLE IF EXISTS children CASCADE;');
      await pool.query('DROP TABLE IF EXISTS schools CASCADE;');
      await pool.query('DROP TABLE IF EXISTS clients CASCADE;');
    }

    // 2. Create sequences
    await pool.query(createSequences);

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
    await pool.query(createDailyMenusTable);
    await pool.query(createChildrenTable);
    await pool.query(createSubscriptionsTable);
    await pool.query(createCorporateLocationsTable);
    await pool.query(createProfessionalProfilesTable);
    await pool.query(createParentProfilesTable);
    await pool.query(createTeacherProfilesTable);

    // Migration: Force CH- prefix for children and set as default for existing tables
    await pool.query("ALTER TABLE children ALTER COLUMN id SET DEFAULT 'CH-' || nextval('child_id_seq')::TEXT;");
    await pool.query("UPDATE children SET id = REPLACE(id, 'PH-', 'CH-') WHERE id LIKE 'PH-%';");

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
    
    // Ensure menus table has the public_id column and remove school_id if it exists
    await pool.query(`ALTER TABLE daily_menus ADD COLUMN IF NOT EXISTS image_public_id TEXT;`);
    await pool.query(`ALTER TABLE daily_menus DROP COLUMN IF EXISTS school_id;`);
    
    console.log('Database tables initialized successfully.');

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
      console.log('Default admin seeded: +911234567890 / adminpassword');
    }

    // ──────────────────────────────────────────────
    // Hash any plain-text passwords manually added to DB
    // ──────────────────────────────────────────────
    const allAdmins = await pool.query('SELECT id, password FROM admins');
    for (let admin of allAdmins.rows) {
      // Check if password looks like a bcrypt hash (starts with $2b$, $2a$, or $2y$)
      if (!admin.password.startsWith('$2b$') && !admin.password.startsWith('$2a$') && !admin.password.startsWith('$2y$')) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(admin.password, salt);
        await pool.query('UPDATE admins SET password = $1 WHERE id = $2', [hashedPassword, admin.id]);
        console.log(`Hashed plain-text password for admin ID: ${admin.id}`);
      }
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
      console.log('Meal sizes seeded: Small, Medium, Large');
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
      console.log('Standards seeded: 1st to 12th');
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

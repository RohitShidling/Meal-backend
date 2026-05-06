const { Pool } = require('pg');
const bcrypt = require('bcrypt');
process.env.DOTENVX_QUIET = '1';
require('dotenv').config({ quiet: true });

const sessionTz = /^[A-Za-z0-9_/+-]+$/.test(process.env.PG_SESSION_TIMEZONE || '')
  ? process.env.PG_SESSION_TIMEZONE
  : 'Asia/Kolkata';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'meal',
  user: process.env.DB_USER || 'RohitRohit',
  password: process.env.DB_PASSWORD || 'RohitRohit',
  // Calendar-day logic (subscription start/end vs token date) expects consistent DATE() casting.
  options: `-c TimeZone=${sessionTz}`,
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
    CREATE SEQUENCE IF NOT EXISTS order_id_seq;
    CREATE SEQUENCE IF NOT EXISTS transaction_id_seq;
    CREATE SEQUENCE IF NOT EXISTS homepage_id_seq;
    CREATE SEQUENCE IF NOT EXISTS cart_id_seq;
    CREATE SEQUENCE IF NOT EXISTS client_subscription_id_seq;
    CREATE SEQUENCE IF NOT EXISTS entity_id_seq;
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

  const createStatesTable = `
    CREATE TABLE IF NOT EXISTS states (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(100) UNIQUE NOT NULL,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createCitiesTable = `
    CREATE TABLE IF NOT EXISTS cities (
      id            SERIAL PRIMARY KEY,
      state_id      INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
      name          VARCHAR(120) NOT NULL,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(state_id, name)
    );
  `;

  const createCompaniesTable = `
    CREATE TABLE IF NOT EXISTS companies (
      id            SERIAL PRIMARY KEY,
      city_id       INTEGER REFERENCES cities(id) ON DELETE SET NULL,
      name          VARCHAR(255) UNIQUE NOT NULL,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      price_with_saturday DECIMAL(10, 2),
      price_without_saturday DECIMAL(10, 2),
      saturday_option_enabled BOOLEAN NOT NULL DEFAULT true,
      meal_size_id INTEGER REFERENCES meal_sizes(id) ON DELETE SET NULL,
      billing_cycle   VARCHAR(50) NOT NULL,
      duration_days   INTEGER NOT NULL DEFAULT 30,
      duration_days_with_saturday INTEGER,
      duration_days_without_saturday INTEGER,
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
      meal_size_id          INTEGER REFERENCES meal_sizes(id) ON DELETE SET NULL,
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
      school_id           VARCHAR(20) REFERENCES schools(id) ON DELETE SET NULL,
      city                VARCHAR(100) NOT NULL,
      state               VARCHAR(100) NOT NULL,
      meal_time           TIME NOT NULL DEFAULT '12:30:00',
      location            TEXT NOT NULL,
      status              VARCHAR(50) NOT NULL DEFAULT 'active',
      meal_time           TIME,
      meal_size_id        INTEGER REFERENCES meal_sizes(id) ON DELETE SET NULL,
      created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createOrdersTable = `
    CREATE TABLE IF NOT EXISTS orders (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'ORD-' || nextval('order_id_seq')::TEXT,
      client_id       VARCHAR(20) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      subscription_id VARCHAR(20) NOT NULL REFERENCES subscriptions(id),
      entity_type     VARCHAR(20) NOT NULL, -- 'child', 'teacher', 'professional'
      entity_id       VARCHAR(20) NOT NULL, -- ID of the child/teacher/professional
      amount          DECIMAL(10, 2) NOT NULL,
      include_saturday BOOLEAN NOT NULL DEFAULT true,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
      start_date      DATE, -- User selected start date for the subscription
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createTransactionsTable = `
    CREATE TABLE IF NOT EXISTS transactions (
      id                      VARCHAR(20) PRIMARY KEY DEFAULT 'TXN-' || nextval('transaction_id_seq')::TEXT,
      order_id                VARCHAR(20) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      merchant_transaction_id VARCHAR(255) UNIQUE NOT NULL,
      gateway_transaction_id  VARCHAR(255),
      amount                  DECIMAL(10, 2) NOT NULL,
      status                  VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failure'
      payment_method          VARCHAR(50),
      gateway_response        JSONB,
      created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createClientSubscriptionsTable = `
    CREATE TABLE IF NOT EXISTS client_subscriptions (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'CT-SUB-' || nextval('client_subscription_id_seq')::TEXT,
      client_id       VARCHAR(20) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      subscription_id VARCHAR(20) NOT NULL REFERENCES subscriptions(id),
      entity_type     VARCHAR(20) NOT NULL,
      entity_id       VARCHAR(20) NOT NULL,
      start_date      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_date        TIMESTAMP NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      include_saturday BOOLEAN NOT NULL DEFAULT true,
      order_id        VARCHAR(20) REFERENCES orders(id),
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, entity_id, entity_type)
    );
  `;

  const createSubscriptionFeaturesTable = `
    CREATE TABLE IF NOT EXISTS subscription_features (
      id               SERIAL PRIMARY KEY,
      subscription_id  VARCHAR(20) NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      feature_text     VARCHAR(255) NOT NULL,
      sort_order       INTEGER NOT NULL DEFAULT 1,
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createDailyMenuNutritionTable = `
    CREATE TABLE IF NOT EXISTS daily_menu_nutrition (
      id               SERIAL PRIMARY KEY,
      menu_id          VARCHAR(20) NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
      nutrition_text   VARCHAR(255) NOT NULL,
      sort_order       INTEGER NOT NULL DEFAULT 1,
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // CART TABLE (for multi-entity payments)
  // ──────────────────────────────────────────────
  const createCartsTable = `
    CREATE TABLE IF NOT EXISTS carts (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'CART-' || nextval('cart_id_seq')::TEXT,
      client_id       VARCHAR(20) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      status          VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'checked_out', 'abandoned'
      total_amount    DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, status) -- Only one active cart per client
    );
  `;

  const createCartItemsTable = `
    CREATE TABLE IF NOT EXISTS cart_items (
      id              SERIAL PRIMARY KEY,
      cart_id         VARCHAR(20) NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      subscription_id VARCHAR(20) NOT NULL REFERENCES subscriptions(id),
      entity_type     VARCHAR(20) NOT NULL, -- 'child', 'teacher', 'professional'
      entity_id       VARCHAR(20) NOT NULL,
      entity_name     VARCHAR(255),
      unit_price      DECIMAL(10, 2) NOT NULL,
      include_saturday BOOLEAN NOT NULL DEFAULT true,
      start_date      DATE, -- User selected start date for this cart item
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cart_id, entity_id, entity_type) -- Cannot add same entity twice to cart
    );
  `;

  // ──────────────────────────────────────────────
  // ENTITIES TABLE
  // ──────────────────────────────────────────────
  const createEntitiesTable = `
    CREATE TABLE IF NOT EXISTS entities (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'ENT-' || nextval('entity_id_seq')::TEXT,
      name            VARCHAR(100) UNIQUE NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      updated_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createAppSettingsTable = `
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key   VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      description   TEXT,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createSubscriptionMealAdjustmentsTable = `
    CREATE TABLE IF NOT EXISTS subscription_meal_adjustments (
      id              SERIAL PRIMARY KEY,
      subscription_id VARCHAR(20) NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
      adjusted_by     INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      adjustment_type VARCHAR(50) NOT NULL,
      meal_delta      INTEGER NOT NULL,
      reason          TEXT NOT NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createTokenDownloadLogsTable = `
    CREATE TABLE IF NOT EXISTS token_download_logs (
      id                 SERIAL PRIMARY KEY,
      token_scope        VARCHAR(20) NOT NULL, -- 'school' | 'corporate'
      scope_id           VARCHAR(20) NOT NULL, -- schoolId or locationId
      meal_size_id       INTEGER NOT NULL DEFAULT -1,
      token_date         DATE NOT NULL DEFAULT CURRENT_DATE,
      downloaded         BOOLEAN NOT NULL DEFAULT true,
      download_count     INTEGER NOT NULL DEFAULT 0,
      first_downloaded_at TIMESTAMP,
      last_downloaded_at TIMESTAMP,
      last_downloaded_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ──────────────────────────────────────────────
  // HOMEPAGES TABLE
  // ──────────────────────────────────────────────
  const createHomepagesTable = `
    CREATE TABLE IF NOT EXISTS homepages (
      id              VARCHAR(20) PRIMARY KEY DEFAULT 'HP-' || nextval('homepage_id_seq')::TEXT,
      entity_id       VARCHAR(20) REFERENCES entities(id),
      name            VARCHAR(255) NOT NULL,
      description     TEXT NOT NULL,
      display_order   INTEGER NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      updated_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_id)
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
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS username VARCHAR(120);`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);

    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS username VARCHAR(120);`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;`);
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);
    await pool.query(`UPDATE admins SET username = 'admin' WHERE username IS NULL;`);

    // Create new feature tables
    await pool.query(createSchoolsTable);
    await pool.query(createMealSizesTable);
    await pool.query(createStandardsTable);
    await pool.query(createStatesTable);
    await pool.query(createCitiesTable);
    await pool.query(createCompaniesTable);
    await pool.query(createDailyMenusTable);
    await pool.query(createChildrenTable);
    await pool.query(createSubscriptionsTable);
    await pool.query(createCorporateLocationsTable);
    await pool.query(createProfessionalProfilesTable);
    await pool.query(createParentProfilesTable);
    await pool.query(createTeacherProfilesTable);
    await pool.query(createOrdersTable);
    await pool.query(createTransactionsTable);
    await pool.query(createClientSubscriptionsTable);
    await pool.query(createSubscriptionFeaturesTable);
    await pool.query(createDailyMenuNutritionTable);
    await pool.query(createEntitiesTable);
    await pool.query(createHomepagesTable);
    await pool.query(createCartsTable);
    await pool.query(createCartItemsTable);
    await pool.query(createAppSettingsTable);

    // ──────────────────────────────────────────────
    // MEAL SKIPS TABLE (client-initiated meal pauses)
    // ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meal_skips (
        id              SERIAL PRIMARY KEY,
        client_id       VARCHAR(20) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        entity_type     VARCHAR(20) NOT NULL,
        entity_id       VARCHAR(20) NOT NULL,
        skip_start_date DATE NOT NULL,
        skip_end_date   DATE NOT NULL,
        total_skip_days INTEGER NOT NULL DEFAULT 0,
        status          VARCHAR(20) NOT NULL DEFAULT 'approved', -- 'approved', 'cancelled'
        created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ──────────────────────────────────────────────
    // MEAL REDUCTIONS LOG TABLE (admin audit trail)
    // ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meal_reductions (
        id              SERIAL PRIMARY KEY,
        reduced_by      INTEGER REFERENCES admins(id),
        reduction_date  DATE NOT NULL,
        affected_count  INTEGER NOT NULL DEFAULT 0,
        skipped_count   INTEGER NOT NULL DEFAULT 0,
        details         JSONB,
        created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reduction_date)
      );
    `);

    // (Moved daily_meal_log creation after migration to avoid type mismatch)

    // ──────────────────────────────────────────────
    // MIGRATIONS: Add meal tracking columns
    // ──────────────────────────────────────────────
    await pool.query(`ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS total_meals INTEGER DEFAULT 30;`);
    await pool.query(`ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS used_meals INTEGER DEFAULT 0;`);
    // Drop old remaining_meals column if it exists (we now compute remaining = total - used)
    await pool.query(`ALTER TABLE client_subscriptions DROP COLUMN IF EXISTS remaining_meals;`);

    // ──────────────────────────────────────────────
    // MIGRATION: Convert client_subscriptions.id from INTEGER to CT-SUB-X
    // ──────────────────────────────────────────────
    const csColCheck = await pool.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name='client_subscriptions' AND column_name='id'
    `);
    if (csColCheck.rows.length > 0 && csColCheck.rows[0].data_type === 'integer') {
      console.log('Migrating client_subscriptions.id to CT-SUB-X format...');
      // Drop dependent tables/constraints first
      await pool.query(`DROP TABLE IF EXISTS daily_meal_log CASCADE;`);
      // Convert existing integer IDs to CT-SUB-X
      await pool.query(`ALTER TABLE client_subscriptions ALTER COLUMN id TYPE VARCHAR(20) USING 'CT-SUB-' || id::TEXT;`);
      await pool.query(`ALTER TABLE client_subscriptions ALTER COLUMN id SET DEFAULT 'CT-SUB-' || nextval('client_subscription_id_seq')::TEXT;`);
      // Set sequence to max existing value
      await pool.query(`
        SELECT setval('client_subscription_id_seq', 
          COALESCE((SELECT MAX(REPLACE(id, 'CT-SUB-', '')::INTEGER) FROM client_subscriptions), 1),
          (SELECT MAX(id) IS NOT NULL FROM client_subscriptions)
        );
      `);
      // Recreate daily_meal_log with correct FK type
      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_meal_log (
          id                  SERIAL PRIMARY KEY,
          subscription_id     VARCHAR(20) NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
          entity_type         VARCHAR(20) NOT NULL,
          entity_id           VARCHAR(20) NOT NULL,
          meal_date           DATE NOT NULL,
          reduction_id        INTEGER REFERENCES meal_reductions(id),
          created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(subscription_id, meal_date)
        );
      `);
      console.log('Migration complete: client_subscriptions now uses CT-SUB-X format.');
    }

    // ──────────────────────────────────────────────
    // DAILY MEAL LOG TABLE (per-entity, per-date truth)
    // ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_meal_log (
        id                  SERIAL PRIMARY KEY,
        subscription_id     VARCHAR(20) NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
        entity_type         VARCHAR(20) NOT NULL,
        entity_id           VARCHAR(20) NOT NULL,
        meal_date           DATE NOT NULL,
        reduction_id        INTEGER REFERENCES meal_reductions(id),
        created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subscription_id, meal_date)
      );
    `);

    await pool.query(createSubscriptionMealAdjustmentsTable);
    await pool.query(createTokenDownloadLogsTable);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_pdf_exports (
        id              SERIAL PRIMARY KEY,
        token_scope     VARCHAR(32) NOT NULL,
        scope_id        VARCHAR(64) NOT NULL,
        meal_size_id    INTEGER NOT NULL DEFAULT -1,
        token_date      DATE NOT NULL,
        admin_id        INTEGER REFERENCES admins(id) ON DELETE SET NULL,
        row_count       INTEGER NOT NULL DEFAULT 0,
        content_sha256  CHAR(64),
        pdf_bytes       BYTEA NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_token_pdf_exports_date ON token_pdf_exports (token_date DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_token_pdf_exports_scope_day ON token_pdf_exports (token_scope, scope_id, token_date)`
    );

    // Token download logs: enforce real uniqueness (Postgres UNIQUE treats NULL meal_size_id as distinct rows)
    await pool.query(`
      ALTER TABLE token_download_logs
      DROP CONSTRAINT IF EXISTS token_download_logs_token_scope_scope_id_meal_size_id_token_date_key
    `);
    await pool.query(`UPDATE token_download_logs SET meal_size_id = -1 WHERE meal_size_id IS NULL`);
    await pool.query(`ALTER TABLE token_download_logs ALTER COLUMN meal_size_id SET DEFAULT -1`);
    await pool.query(`ALTER TABLE token_download_logs ALTER COLUMN meal_size_id SET NOT NULL`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_download_logs_scope_meal_day
      ON token_download_logs (token_scope, scope_id, meal_size_id, token_date)
    `);

    // Migration: Add order_type to orders table if it doesn't exist
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'single';`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cart_id VARCHAR(20) REFERENCES carts(id);`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS start_date DATE;`);
    await pool.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS start_date DATE;`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS include_saturday BOOLEAN NOT NULL DEFAULT true;`);
    await pool.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS include_saturday BOOLEAN NOT NULL DEFAULT true;`);
    await pool.query(`ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS include_saturday BOOLEAN NOT NULL DEFAULT true;`);

    // Teacher → school mapping (needed for school token PDFs that include teachers)
    await pool.query(`ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS school_id VARCHAR(20) REFERENCES schools(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS meal_time TIME;`);
    await pool.query(`UPDATE teacher_profiles SET meal_time = '12:30:00' WHERE meal_time IS NULL;`);
    await pool.query(`ALTER TABLE teacher_profiles ALTER COLUMN meal_time SET DEFAULT '12:30:00';`);
    await pool.query(`ALTER TABLE teacher_profiles ALTER COLUMN meal_time SET NOT NULL;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_teacher_profiles_school_id ON teacher_profiles (school_id);`);
    // Best-effort backfill from legacy free-text name (case-insensitive exact match after trim)
    await pool.query(`
      UPDATE teacher_profiles tp
      SET school_id = sc.id, updated_at = NOW()
      FROM schools sc
      WHERE tp.school_id IS NULL
        AND LOWER(TRIM(tp.school_college_name)) = LOWER(TRIM(sc.name))
    `);

    // Migration: Add explicit duration_days to subscriptions
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_days INTEGER;`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_with_saturday DECIMAL(10, 2);`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_without_saturday DECIMAL(10, 2);`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS saturday_option_enabled BOOLEAN NOT NULL DEFAULT true;`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS meal_size_id INTEGER REFERENCES meal_sizes(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_days_with_saturday INTEGER;`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_days_without_saturday INTEGER;`);
    await pool.query(`UPDATE subscriptions SET price_with_saturday = price WHERE price_with_saturday IS NULL;`);
    await pool.query(`UPDATE subscriptions SET price_without_saturday = price WHERE price_without_saturday IS NULL;`);
    await pool.query(`
      UPDATE subscriptions
      SET duration_days = CASE LOWER(COALESCE(billing_cycle, ''))
        WHEN 'daily' THEN 1
        WHEN 'weekly' THEN 7
        WHEN 'monthly' THEN 30
        WHEN 'yearly' THEN 365
        WHEN 'annual' THEN 365
        ELSE 30
      END
      WHERE duration_days IS NULL OR duration_days <= 0;
    `);
    await pool.query(`ALTER TABLE subscriptions ALTER COLUMN duration_days SET DEFAULT 30;`);

    // Migration: profile enhancements (meal size + time)
    await pool.query(`ALTER TABLE professional_profiles ADD COLUMN IF NOT EXISTS meal_size_id INTEGER REFERENCES meal_sizes(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS meal_time TIME;`);
    await pool.query(`ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS meal_size_id INTEGER REFERENCES meal_sizes(id) ON DELETE SET NULL;`);

    // Migration: Ensure subscription_features exists and stays clean
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_features (
        id               SERIAL PRIMARY KEY,
        subscription_id  VARCHAR(20) NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        feature_text     VARCHAR(255) NOT NULL,
        sort_order       INTEGER NOT NULL DEFAULT 1,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_menu_nutrition (
        id               SERIAL PRIMARY KEY,
        menu_id          VARCHAR(20) NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
        nutrition_text   VARCHAR(255) NOT NULL,
        sort_order       INTEGER NOT NULL DEFAULT 1,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add entity_id to homepages and handle unique constraints
    await pool.query(`ALTER TABLE homepages ADD COLUMN IF NOT EXISTS entity_id VARCHAR(20) REFERENCES entities(id);`);
    try {
      // Add new constraint: Ensure only one homepage entry per entity
      await pool.query(`ALTER TABLE homepages ADD CONSTRAINT homepages_entity_id_key UNIQUE(entity_id);`);
    } catch(e) {
      // Ignore if constraint already added
    }

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
        'INSERT INTO admins (phone_number, password, username) VALUES ($1, $2, $3)',
        ['+911234567890', hashedPassword, 'admin']
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

    await pool.query(`
      INSERT INTO app_settings (setting_key, setting_value, description)
      VALUES
        ('meal_skip_min_days', '3', 'Minimum consecutive days required for a meal skip request'),
        ('meal_skip_min_notice_days', '1', 'How many days in advance skip must be requested')
      ON CONFLICT (setting_key) DO NOTHING;
    `);

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

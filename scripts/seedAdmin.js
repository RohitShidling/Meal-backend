const db = require('../src/common/database');
const bcrypt = require('bcrypt');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    const seedPhone = process.env.ADMIN_SEED_PHONE;
    const seedPass = process.env.ADMIN_SEED_PASSWORD;
    const seedUsername = process.env.ADMIN_SEED_USERNAME;
    const seedName = process.env.ADMIN_SEED_NAME;

    if (!seedPhone || !seedPass) {
      console.error('❌ ADMIN_SEED_PHONE and ADMIN_SEED_PASSWORD must be set in .env');
      process.exit(1);
    }

    console.log('--- Admin Seeding Script ---');
    console.log(`Target Phone: ${seedPhone}`);
    console.log(`Target Username: ${seedUsername}`);
    console.log(`Target Name: ${seedName}`);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(seedPass, salt);

    const adminCheck = await db.query('SELECT id, password FROM admins WHERE phone_number = $1', [seedPhone]);

    if (adminCheck.rows.length === 0) {
      await db.query(
        'INSERT INTO admins (phone_number, password, username, name) VALUES ($1, $2, $3, $4)',
        [seedPhone, hashedPassword, seedUsername, seedName]
      );
      console.log('✅ Admin user created successfully.');
    } else {
      await db.query(
        'UPDATE admins SET password = $1, username = $2, name = $3 WHERE phone_number = $4',
        [hashedPassword, seedUsername, seedName, seedPhone]
      );
      console.log('✅ Admin user updated successfully (password re-hashed).');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedAdmin();

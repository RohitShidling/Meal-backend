const db = require('./src/common/database');
(async () => {
  try {
    const res = await db.query('SELECT * FROM admins');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();

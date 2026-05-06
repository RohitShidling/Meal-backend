/**
 * Single source of truth for "does this subscription get a meal / token on calendar date D?"
 * Used by: token PDFs, token lists, meal reduction, kitchen-style counts.
 *
 * Rules (all must hold):
 * - Active subscription, remaining meals > 0
 * - DATE(start_date) <= D and DATE(end_date) >= D (inclusive validity window)
 * - If include_saturday is false, Saturday (ISO dow 6) has no meal
 * - Approved skip covering D only counts if range length >= configured min consecutive days
 */
const { pool, query } = require('../database');
const AppError = require('../utils/AppError');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MEAL_TIME = '1:00 PM';
const DEFAULT_TEACHER_PROFESSIONAL_MEAL_SIZE_LABEL = 'Large';

const sessionTimezone = () =>
  /^[A-Za-z0-9_/+-]+$/.test(process.env.PG_SESSION_TIMEZONE || '')
    ? process.env.PG_SESSION_TIMEZONE
    : 'Asia/Kolkata';

const parseSessionToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: sessionTimezone() });

const resolveDeliveryDate = (inputDate, next) => {
  if (!inputDate) return parseSessionToday();
  if (!DATE_REGEX.test(inputDate)) {
    next(new AppError('Invalid date format. Use YYYY-MM-DD.', 400));
    return null;
  }
  const parsed = new Date(`${inputDate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    next(new AppError('Invalid date value.', 400));
    return null;
  }
  return inputDate;
};

const mealTimeSql = (columnRef) => `
  CASE
    WHEN ${columnRef} IS NULL OR BTRIM(${columnRef}::text) = '' THEN '${DEFAULT_MEAL_TIME}'
    WHEN ${columnRef}::text ~* '^\\s*\\d{1,2}:\\d{2}\\s*(AM|PM)\\s*$'
      THEN UPPER(TO_CHAR(TO_TIMESTAMP(TRIM(${columnRef}::text), 'HH12:MI AM'), 'FMHH12:MI AM'))
    WHEN ${columnRef}::text ~ '^\\s*\\d{1,2}:\\d{2}\\s*$'
      THEN UPPER(TO_CHAR(TRIM(${columnRef}::text)::time, 'FMHH12:MI AM'))
    ELSE '${DEFAULT_MEAL_TIME}'
  END
`;

/**
 * SQL predicate on client_subscriptions row alias `cs` — parameter $1 = delivery DATE as string.
 * Skip policy read from app_settings at query time (no stale min-day threshold).
 */
const subscriptionEligiblePredicateSql = (csAlias = 'cs') => `
  ${csAlias}.is_active = true
  AND (${csAlias}.total_meals - ${csAlias}.used_meals) > 0
  AND DATE(${csAlias}.start_date) <= $1::date
  AND DATE(${csAlias}.end_date) >= $1::date
  AND (
    ${csAlias}.include_saturday = true
    OR EXTRACT(ISODOW FROM $1::date) IS DISTINCT FROM 6
  )
  AND NOT EXISTS (
    SELECT 1 FROM meal_skips sk
    WHERE sk.entity_type = ${csAlias}.entity_type
      AND sk.entity_id = ${csAlias}.entity_id
      AND sk.status = 'approved'
      AND sk.skip_start_date <= $1::date
      AND sk.skip_end_date >= $1::date
      AND (sk.skip_end_date - sk.skip_start_date + 1) >= (
        SELECT COALESCE(MAX(setting_value::int), 3)
        FROM app_settings
        WHERE setting_key = 'meal_skip_min_days'
      )
  )
`;

/** @param {string} delivery - YYYY-MM-DD */
async function countSkippedDueToPolicyOnly(delivery, dbClient = null) {
  const run = dbClient ? dbClient.query.bind(dbClient) : query;
  const minRes = await run(
    `SELECT COALESCE(MAX(setting_value::int), 3) AS n
     FROM app_settings WHERE setting_key = 'meal_skip_min_days'`
  );
  const minDays = minRes.rows[0]?.n ?? 3;

  const r = await run(
    `SELECT COUNT(*)::int AS c
     FROM client_subscriptions cs
     WHERE cs.is_active = true
       AND (cs.total_meals - cs.used_meals) > 0
       AND DATE(cs.start_date) <= $1::date
       AND DATE(cs.end_date) >= $1::date
       AND (
         cs.include_saturday = true
         OR EXTRACT(ISODOW FROM $1::date) IS DISTINCT FROM 6
       )
       AND EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type = cs.entity_type
           AND sk.entity_id = cs.entity_id
           AND sk.status = 'approved'
           AND sk.skip_start_date <= $1::date
           AND sk.skip_end_date >= $1::date
           AND (sk.skip_end_date - sk.skip_start_date + 1) >= $2
       )`,
    [delivery, minDays]
  );
  return r.rows[0]?.c ?? 0;
}

async function fetchSchoolMealSizeCounts(delivery) {
  const pred = subscriptionEligiblePredicateSql('cs');
  return query(
    `WITH large_size AS (
       SELECT id
       FROM meal_sizes
       WHERE is_active = true
         AND (LOWER(name) = 'large' OR LOWER(display_name) = 'large')
       ORDER BY sort_order ASC, id ASC
       LIMIT 1
     )
     SELECT school_id, meal_size_id, SUM(cnt)::int AS students_count
     FROM (
       SELECT ch.school_id AS school_id,
              ch.meal_size_id AS meal_size_id,
              COUNT(DISTINCT ch.id)::int AS cnt
       FROM children ch
       INNER JOIN client_subscriptions cs
         ON cs.entity_type = 'child'
        AND cs.entity_id = ch.id
        AND ${pred}
       GROUP BY ch.school_id, ch.meal_size_id

       UNION ALL

       SELECT tp.school_id AS school_id,
              COALESCE(sub.meal_size_id, ls.id) AS meal_size_id,
              COUNT(DISTINCT tp.id)::int AS cnt
       FROM teacher_profiles tp
       LEFT JOIN large_size ls ON TRUE
       INNER JOIN client_subscriptions cs
         ON cs.entity_type = 'teacher'
        AND cs.entity_id = tp.id
        AND ${pred}
       INNER JOIN subscriptions sub ON sub.id = cs.subscription_id
       WHERE tp.school_id IS NOT NULL
       GROUP BY tp.school_id, COALESCE(sub.meal_size_id, ls.id)
     ) z
     GROUP BY school_id, meal_size_id`,
    [delivery]
  );
}

async function fetchChildTokenRows({ schoolId, mealSizeId, delivery }) {
  let params;
  let sizeClause;
  let deliveryParam;

  if (mealSizeId !== null && mealSizeId !== undefined && mealSizeId !== '') {
    params = [schoolId, mealSizeId, delivery];
    sizeClause = 'AND ch.meal_size_id = $2';
    deliveryParam = '$3';
  } else {
    params = [schoolId, delivery];
    sizeClause = '';
    deliveryParam = '$2';
  }

  const pred = subscriptionEligiblePredicateSql('cs').replace(/\$1/g, deliveryParam);

  const teacherMealSizeFilter =
    mealSizeId !== null && mealSizeId !== undefined && mealSizeId !== ''
      ? 'AND COALESCE(sub2.meal_size_id, ls.id) = $2'
      : '';

  const sql = `
    WITH large_size AS (
      SELECT id, display_name, sort_order
      FROM meal_sizes
      WHERE is_active = true
        AND (LOWER(name) = 'large' OR LOWER(display_name) = 'large')
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    ),
    child_tokens AS (
      SELECT DISTINCT ON (ch.id)
             ch.id AS entity_id,
             'child' AS entity_type,
             ch.name AS child_name,
             ch.name AS student_name,
             ch.roll_number,
             s.display_name AS standard,
             ms.display_name AS meal_size,
             ms.sort_order,
             ${mealTimeSql('ch.meal_time')} AS meal_time,
             (cs.total_meals - cs.used_meals) AS remaining_meals,
             cs.id AS subscription_id
      FROM children ch
      INNER JOIN client_subscriptions cs
        ON cs.entity_type = 'child'
       AND cs.entity_id = ch.id
       AND ${pred}
      LEFT JOIN standards s ON s.id = ch.standard_id
      LEFT JOIN meal_sizes ms ON ms.id = ch.meal_size_id
      WHERE ch.school_id = $1
        ${sizeClause}
      ORDER BY ch.id, cs.id
    ),
    teacher_tokens AS (
      SELECT DISTINCT ON (tp.id)
             tp.id AS entity_id,
             'teacher' AS entity_type,
             tp.name AS child_name,
             tp.name AS student_name,
             NULL::varchar AS roll_number,
             NULL::varchar AS standard,
             COALESCE(ms2.display_name, ls.display_name, '${DEFAULT_TEACHER_PROFESSIONAL_MEAL_SIZE_LABEL}') AS meal_size,
             COALESCE(ms2.sort_order, ls.sort_order, 9999) AS sort_order,
             ${mealTimeSql('tp.meal_time')} AS meal_time,
             (cs2.total_meals - cs2.used_meals) AS remaining_meals,
             cs2.id AS subscription_id
      FROM teacher_profiles tp
      LEFT JOIN large_size ls ON TRUE
      INNER JOIN client_subscriptions cs2
        ON cs2.entity_type = 'teacher'
       AND cs2.entity_id = tp.id
       AND ${pred.replace(/cs\./g, 'cs2.')}
      INNER JOIN subscriptions sub2 ON sub2.id = cs2.subscription_id
      LEFT JOIN meal_sizes ms2 ON ms2.id = sub2.meal_size_id
      WHERE tp.school_id = $1
        ${teacherMealSizeFilter}
      ORDER BY tp.id, cs2.id
    )
    SELECT * FROM child_tokens
    UNION ALL
    SELECT * FROM teacher_tokens
    ORDER BY sort_order NULLS LAST, meal_size, entity_type, child_name`;

  return query(sql, params);
}

async function fetchProfessionalTokenRows({ locationId, delivery }) {
  const pred = subscriptionEligiblePredicateSql('cs');
  return query(
    `WITH large_size AS (
       SELECT id, display_name
       FROM meal_sizes
       WHERE is_active = true
         AND (LOWER(name) = 'large' OR LOWER(display_name) = 'large')
       ORDER BY sort_order ASC, id ASC
       LIMIT 1
     )
     SELECT * FROM (
       SELECT DISTINCT ON (pp.id)
              pp.id AS entity_id,
              'professional' AS entity_type,
              pp.name AS name,
              pp.name AS professional_name,
              pp.company_name,
              (cs.total_meals - cs.used_meals) AS remaining_meals,
              cs.id AS subscription_id,
              COALESCE(ms.display_name, ls.display_name, '${DEFAULT_TEACHER_PROFESSIONAL_MEAL_SIZE_LABEL}') AS meal_size
       FROM professional_profiles pp
       LEFT JOIN large_size ls ON TRUE
       INNER JOIN client_subscriptions cs
         ON cs.entity_type = 'professional'
        AND cs.entity_id = pp.id
        AND ${pred}
       INNER JOIN subscriptions sub ON sub.id = cs.subscription_id
       LEFT JOIN meal_sizes ms ON ms.id = sub.meal_size_id
       WHERE pp.corporate_location_id = $2
       ORDER BY pp.id, cs.id
     ) t
     ORDER BY t.professional_name`,
    [delivery, locationId]
  );
}

async function fetchDistinctSchoolsWithEligibleChildren(delivery) {
  const pred = subscriptionEligiblePredicateSql('cs');
  return query(
    `SELECT DISTINCT sc.id AS school_id, sc.name AS school_name
     FROM schools sc
     WHERE EXISTS (
       SELECT 1
       FROM children ch
       INNER JOIN client_subscriptions cs
         ON cs.entity_type = 'child'
        AND cs.entity_id = ch.id
        AND ${pred}
       WHERE ch.school_id = sc.id
     )
     OR EXISTS (
       SELECT 1
       FROM teacher_profiles tp
       INNER JOIN client_subscriptions cs2
         ON cs2.entity_type = 'teacher'
        AND cs2.entity_id = tp.id
        AND ${pred.replace(/cs\./g, 'cs2.')}
       WHERE tp.school_id = sc.id
     )
     ORDER BY sc.name ASC`,
    [delivery]
  );
}

async function fetchDistinctCorporateLocationsWithEligible(delivery) {
  const pred = subscriptionEligiblePredicateSql('cs');
  return query(
    `SELECT DISTINCT cl.id AS location_id, cl.name AS location_name
     FROM corporate_locations cl
     INNER JOIN professional_profiles pp ON pp.corporate_location_id = cl.id
     INNER JOIN client_subscriptions cs
       ON cs.entity_type = 'professional'
      AND cs.entity_id = pp.id
      AND ${pred}
     ORDER BY cl.name ASC`,
    [delivery]
  );
}

async function fetchCorporateOverviewBase(delivery) {
  const pred = subscriptionEligiblePredicateSql('cs');
  return query(
    `SELECT cl.id AS corporate_location_id,
            cl.name AS corporate_location_name,
            COUNT(DISTINCT pp.id)::INTEGER AS professionals_count
     FROM corporate_locations cl
     INNER JOIN professional_profiles pp ON pp.corporate_location_id = cl.id
     INNER JOIN client_subscriptions cs
       ON cs.entity_type = 'professional'
      AND cs.entity_id = pp.id
      AND ${pred}
     GROUP BY cl.id, cl.name
     ORDER BY cl.name ASC`,
    [delivery]
  );
}

/**
 * Admin meal reduction for one calendar date (session "today" or future/past date if API extended later).
 * Transactional: one reduction row per date; idempotent per subscription via daily_meal_log unique key.
 */
/**
 * Single-row check: whether a client_subscriptions row is eligible for a meal on `deliveryDate`.
 * Same rules as token PDFs and meal reduction batch.
 */
async function checkMealEligibilityBySubscriptionId(subscriptionId, deliveryDate) {
  const pred = subscriptionEligiblePredicateSql('cs');
  const r = await query(
    `SELECT cs.id FROM client_subscriptions cs WHERE cs.id = $2 AND ${pred}`,
    [deliveryDate, subscriptionId]
  );
  return { eligible: r.rowCount > 0, subscription_id: subscriptionId, date: deliveryDate };
}

async function executeMealReductionForDate(adminId, deliveryDate) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reductionIns = await client.query(
      `INSERT INTO meal_reductions (reduced_by, reduction_date, affected_count, skipped_count, details)
       VALUES ($1, $2::date, 0, 0, '{}'::jsonb)
       ON CONFLICT (reduction_date) DO NOTHING
       RETURNING id`,
      [adminId, deliveryDate]
    );

    let reductionId = reductionIns.rows[0]?.id;
    const isRepeatReduction = reductionIns.rowCount === 0;
    if (!reductionId) {
      const ex = await client.query(
        `SELECT id
         FROM meal_reductions
         WHERE reduction_date = $1::date
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [deliveryDate]
      );
      if (ex.rowCount === 0) {
        throw new Error('Unable to resolve meal reduction row for date.');
      }
      reductionId = ex.rows[0].id;
    }
    const pred = subscriptionEligiblePredicateSql('cs');
    const tokenEligibleSql = `
      SELECT cs.id AS subscription_id, cs.entity_type, cs.entity_id
      FROM client_subscriptions cs
      INNER JOIN children ch
        ON cs.entity_type = 'child'
       AND cs.entity_id = ch.id
      WHERE ${pred}
        AND ch.school_id IS NOT NULL
      UNION
      SELECT cs.id AS subscription_id, cs.entity_type, cs.entity_id
      FROM client_subscriptions cs
      INNER JOIN teacher_profiles tp
        ON cs.entity_type = 'teacher'
       AND cs.entity_id = tp.id
      WHERE ${pred}
        AND tp.school_id IS NOT NULL
      UNION
      SELECT cs.id AS subscription_id, cs.entity_type, cs.entity_id
      FROM client_subscriptions cs
      INNER JOIN professional_profiles pp
        ON cs.entity_type = 'professional'
       AND cs.entity_id = pp.id
      WHERE ${pred}
        AND pp.corporate_location_id IS NOT NULL
    `;

    const eligibleRes = await client.query(tokenEligibleSql, [deliveryDate]);
    const eligibleCount = eligibleRes.rowCount;

    let reducedRows = [];
    if (isRepeatReduction) {
      // Testing mode behavior: allow repeated same-day reductions for currently eligible token holders.
      reducedRows = eligibleRes.rows;
    } else {
      const insertLog = await client.query(
        `INSERT INTO daily_meal_log (subscription_id, entity_type, entity_id, meal_date, reduction_id)
         SELECT e.subscription_id, e.entity_type, e.entity_id, $1::date, $2
         FROM (
           ${tokenEligibleSql}
         ) e
         ON CONFLICT (subscription_id, meal_date) DO NOTHING
         RETURNING subscription_id, entity_type, entity_id`,
        [deliveryDate, reductionId]
      );
      reducedRows = insertLog.rows;
    }
    const subscriptionIds = reducedRows.map((r) => r.subscription_id);

    if (subscriptionIds.length > 0) {
      await client.query(
        `UPDATE client_subscriptions cs
         SET used_meals = used_meals + 1, updated_at = NOW()
         WHERE cs.id = ANY($1::varchar[])`,
        [subscriptionIds]
      );

      // If a subscription is fully consumed on this reduction date,
      // expire it immediately based on remaining meals (not just calendar end_date).
      await client.query(
        `UPDATE client_subscriptions cs
         SET is_active = false,
             end_date = ($1::date + interval '12 hours'),
             updated_at = NOW()
         WHERE cs.id = ANY($2::varchar[])
           AND (cs.total_meals - cs.used_meals) <= 0`,
        [deliveryDate, subscriptionIds]
      );
    }

    const skippedPause = await countSkippedDueToPolicyOnly(deliveryDate, client);

    const details = {
      affected: reducedRows.map((r) => ({
        subscription_id: r.subscription_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
      })),
      stats: {
        eligible_count: eligibleCount,
        newly_logged: isRepeatReduction ? 0 : reducedRows.length,
        repeated_reduction_mode: isRepeatReduction,
        skipped_due_to_valid_meal_skip: skippedPause,
      },
    };

    await client.query(
      `UPDATE meal_reductions
       SET affected_count = COALESCE(affected_count, 0) + $1,
           skipped_count = $2,
           details = $3::jsonb
       WHERE id = $4`,
      [reducedRows.length, skippedPause, JSON.stringify(details), reductionId]
    );

    await client.query('COMMIT');

    return {
      alreadyDone: false,
      repeated_reduction_mode: isRepeatReduction,
      reductionId,
      date: deliveryDate,
      eligible_count: eligibleCount,
      meals_reduced: reducedRows.length,
      skipped_due_to_meal_pause: skippedPause,
      details,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

const addDaysYmd = (ymd, days) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const isSaturdayYmd = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay() === 6;
};

const extendEndYmdByMealDays = ({ endYmd, includeSaturday, extraMeals }) => {
  let remainingExtra = Number(extraMeals) || 0;
  let cursor = endYmd;
  while (remainingExtra > 0) {
    cursor = addDaysYmd(cursor, 1);
    const saturday = isSaturdayYmd(cursor);
    const isMealDay = includeSaturday || !saturday;
    if (isMealDay) remainingExtra -= 1;
  }
  return cursor;
};

async function reverseMealReductionForDate(adminId, deliveryDate) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reductionRes = await client.query(
      `SELECT id
       FROM meal_reductions
       WHERE reduction_date = $1::date
       FOR UPDATE`,
      [deliveryDate]
    );

    if (reductionRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { notFound: true, date: deliveryDate };
    }

    const reductionId = reductionRes.rows[0].id;
    const affectedRes = await client.query(
      `SELECT dml.subscription_id,
              dml.entity_type,
              dml.entity_id,
              cs.include_saturday,
              TO_CHAR(cs.end_date, 'YYYY-MM-DD') AS end_date_ymd
       FROM daily_meal_log dml
       INNER JOIN client_subscriptions cs ON cs.id = dml.subscription_id
       WHERE dml.reduction_id = $1
         AND dml.meal_date = $2::date`,
      [reductionId, deliveryDate]
    );

    if (affectedRes.rowCount === 0) {
      await client.query('DELETE FROM meal_reductions WHERE id = $1', [reductionId]);
      await client.query('COMMIT');
      return {
        notFound: false,
        reductionId,
        date: deliveryDate,
        restoredCount: 0,
        restored: [],
      };
    }

    const subscriptionIds = affectedRes.rows.map((r) => r.subscription_id);
    await client.query(
      `UPDATE client_subscriptions
       SET used_meals = GREATEST(used_meals - 1, 0),
           is_active = true,
           updated_at = NOW()
       WHERE id = ANY($1::varchar[])`,
      [subscriptionIds]
    );

    for (const row of affectedRes.rows) {
      const endYmd = row.end_date_ymd;
      const newEndYmd = extendEndYmdByMealDays({
        endYmd,
        includeSaturday: row.include_saturday !== false,
        extraMeals: 1,
      });
      await client.query(
        `UPDATE client_subscriptions
         SET end_date = ($1::date + interval '12 hours'),
             updated_at = NOW()
         WHERE id = $2`,
        [newEndYmd, row.subscription_id]
      );
    }

    await client.query(
      `INSERT INTO subscription_meal_adjustments
        (subscription_id, adjusted_by, adjustment_type, meal_delta, reason)
       SELECT dml.subscription_id, $1, 'reduction_rollback', 1, $2
       FROM daily_meal_log dml
       WHERE dml.reduction_id = $3
         AND dml.meal_date = $4::date`,
      [adminId, `Rollback meal reduction for ${deliveryDate}`, reductionId, deliveryDate]
    );

    await client.query(
      `DELETE FROM daily_meal_log
       WHERE reduction_id = $1
         AND meal_date = $2::date`,
      [reductionId, deliveryDate]
    );

    await client.query('DELETE FROM meal_reductions WHERE id = $1', [reductionId]);
    await client.query('COMMIT');

    return {
      notFound: false,
      reductionId,
      date: deliveryDate,
      restoredCount: affectedRes.rowCount,
      restored: affectedRes.rows.map((r) => ({
        subscription_id: r.subscription_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
      })),
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  parseSessionToday,
  resolveDeliveryDate,
  sessionTimezone,
  subscriptionEligiblePredicateSql,
  checkMealEligibilityBySubscriptionId,
  fetchSchoolMealSizeCounts,
  fetchChildTokenRows,
  fetchProfessionalTokenRows,
  fetchDistinctSchoolsWithEligibleChildren,
  fetchDistinctCorporateLocationsWithEligible,
  fetchCorporateOverviewBase,
  executeMealReductionForDate,
  reverseMealReductionForDate,
  countSkippedDueToPolicyOnly,
};

const { Pool } = require('pg');

let pool = null;
const ALLOWED_RELATIONS = new Set([
  'ai_transport_trips',
  'ai_transport_expenses',
  'ai_transport_lab_reports',
  'ai_transport_expected_trucks',
  'ai_transport_trip_events',
  'ai_transport_tasks',
  'ai_transport_task_activity',
  'ai_transport_expense_history',
  'ai_transport_expense_categories'
]);

function getPool() {
  const connectionString = process.env.TRANSPORT_DATABASE_URL || '';
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function getTransportSummary() {
  const db = getPool();
  if (!db) {
    return {
      configured: false,
      note: 'TRANSPORT_DATABASE_URL is not configured.'
    };
  }

  const [tripStatus, sales, expenses, reports] = await Promise.all([
    db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM trips
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status
      ORDER BY count DESC
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS billed_trips,
        COALESCE(SUM(COALESCE(net_weight_snapshot_mt, net_weight, 0)), 0)::numeric AS qty_mt,
        COALESCE(SUM(COALESCE(total_amount, 0)), 0)::numeric AS total_amount
      FROM trips
      WHERE status = ANY($1::text[])
        AND COALESCE(billing_calculated_at, out_time, updated_at) >= NOW() - INTERVAL '30 days'
    `, [['BILLING_COMPLETED', 'COMPLETED', 'EXITED']]),
    db.query(`
      SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::numeric AS amount
      FROM expense_claims
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status
      ORDER BY count DESC
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS total_reports,
        COUNT(*) FILTER (WHERE finalized_at IS NOT NULL OR status = 'FINALIZED')::int AS finalized_reports
      FROM lab_reports
      WHERE is_deleted = false
        AND report_date >= (CURRENT_DATE - INTERVAL '30 days')
    `)
  ]);

  return {
    configured: true,
    window: 'last_30_days',
    trip_status: tripStatus.rows,
    sales: sales.rows[0] || {},
    expense_status: expenses.rows,
    lab_reports: reports.rows[0] || {}
  };
}

function normalizeSql(sql) {
  return String(sql || '').trim().replace(/;+\s*$/g, '');
}

function validateReadOnlySql(sql) {
  const normalized = normalizeSql(sql);
  const lowered = normalized.toLowerCase();

  if (!lowered.startsWith('select ')) {
    throw new Error('Only SELECT questions are allowed');
  }
  if (/[;]/.test(normalized) || /--|\/\*/.test(normalized)) {
    throw new Error('SQL comments and multiple statements are not allowed');
  }
  const blocked = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|merge|refresh|vacuum|analyze)\b/i;
  if (blocked.test(normalized)) {
    throw new Error('SQL contains a blocked operation');
  }

  const relationMatches = [...lowered.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/g)]
    .map((match) => match[1]);
  if (!relationMatches.length) {
    throw new Error('SQL must read from an approved reporting view');
  }
  const disallowed = relationMatches.filter((name) => !ALLOWED_RELATIONS.has(name));
  if (disallowed.length) {
    throw new Error(`SQL references non-approved relation: ${disallowed.join(', ')}`);
  }

  return normalized;
}

function withLimit(sql) {
  if (/\blimit\s+\d+\b/i.test(sql)) return sql;
  return `${sql} LIMIT 100`;
}

async function runReadOnlySql(sql) {
  const db = getPool();
  if (!db) {
    const error = new Error('TRANSPORT_DATABASE_URL is not configured');
    error.status = 503;
    throw error;
  }

  const safeSql = withLimit(validateReadOnlySql(sql));
  const client = await db.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '5000ms'`);
    const result = await client.query(safeSql);
    await client.query('COMMIT');
    return {
      sql: safeSql,
      rows: result.rows,
      rowCount: result.rowCount
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getTransportSummary,
  runReadOnlySql
};

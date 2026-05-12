require('dotenv').config();
const { initDb, pool } = require('../db');

async function checkTable(name, whereClause = 'TRUE') {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${name} WHERE ${whereClause}`);
  return result.rows[0].count;
}

async function run() {
  await initDb();
  const report = {
    env: process.env.NODE_ENV || 'undefined',
    checks: []
  };

  const push = (name, ok, details) => report.checks.push({ name, ok, details });

  try {
    push('node_env_not_production_guarded_defaults', process.env.NODE_ENV !== 'production', `NODE_ENV=${report.env}`);

    const [trips, expected, claims, tasks] = await Promise.all([
      checkTable('trips'),
      checkTable('expected_trucks'),
      checkTable('expense_claims', 'deleted_at IS NULL'),
      checkTable('tasks')
    ]);
    push('core_tables_have_data', trips > 0 && claims >= 0, `trips=${trips}, expected_trucks=${expected}, expense_claims=${claims}, tasks=${tasks}`);

    const roleCounts = await pool.query(`
      SELECT role_name, COUNT(*)::int AS count
      FROM user_roles
      WHERE is_active = true
      GROUP BY role_name
      ORDER BY role_name
    `);
    const roles = Object.fromEntries(roleCounts.rows.map((r) => [r.role_name, r.count]));
    const roleOk = ['Gate', 'Weighbridge', 'Dispatch', 'Loading', 'Accounts', 'Manager', 'Admin'].every((k) => Number(roles[k] || 0) > 0);
    push('transport_roles_seeded', roleOk, JSON.stringify(roles));

    const expenseRoleCounts = await pool.query(`
      SELECT role, COUNT(*)::int AS count
      FROM expense_users
      WHERE is_active = true
      GROUP BY role
      ORDER BY role
    `);
    const eroles = Object.fromEntries(expenseRoleCounts.rows.map((r) => [r.role, r.count]));
    const expenseOk = ['Employee', 'Accounts', 'Manager', 'Admin'].every((k) => Number(eroles[k] || 0) > 0);
    push('expense_roles_seeded', expenseOk, JSON.stringify(eroles));

    const masterCounts = await pool.query(`
      SELECT master_type, COUNT(*)::int AS count
      FROM admin_master_values
      WHERE is_active = true
      GROUP BY master_type
      ORDER BY master_type
    `);
    const masters = Object.fromEntries(masterCounts.rows.map((r) => [r.master_type, r.count]));
    const mastersOk = ['materials', 'grades', 'conditions', 'packing', 'loading_points', 'loading_teams', 'transporters'].every((k) => Number(masters[k] || 0) > 0);
    push('master_data_seeded', mastersOk, JSON.stringify(masters));

    const failed = report.checks.filter((c) => !c.ok);
    console.log(JSON.stringify(report, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run().catch(async (error) => {
  console.error('validate-staging-readiness failed:', error);
  try { await pool.end(); } catch {}
  process.exit(1);
});


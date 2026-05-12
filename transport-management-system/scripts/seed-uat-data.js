require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb, pool } = require('../db');

const BCRYPT_COST = Number(process.env.BCRYPT_COST || 10);
const REQUIRED_APP_ENV = 'staging';

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoHoursAhead(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

async function upsertMaster(client, masterType, value, metadata = {}) {
  await client.query(
    `INSERT INTO admin_master_values(master_type, value, is_active, metadata_json)
     VALUES ($1, $2, true, $3::jsonb)
     ON CONFLICT (master_type, value)
     DO UPDATE SET is_active = true, metadata_json = EXCLUDED.metadata_json, updated_at = NOW()`,
    [masterType, value, JSON.stringify(metadata)]
  );
}

async function upsertTransportUser(client, { username, fullName, password, roles, isActive = true }) {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const userRes = await client.query(
    `INSERT INTO users(username, full_name, password_hash, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username)
     DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING id`,
    [username, fullName, hash, isActive]
  );
  const userId = userRes.rows[0].id;
  await client.query(`UPDATE user_roles SET is_active = false, updated_at = NOW() WHERE user_id = $1`, [userId]);
  for (const role of roles) {
    await client.query(
      `INSERT INTO user_roles(user_id, role_name, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_name)
       DO UPDATE SET is_active = true, updated_at = NOW()`,
      [userId, role]
    );
  }
}

async function upsertExpenseUser(client, { code, fullName, username, password, role, isActive = true }) {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await client.query(
    `INSERT INTO expense_users(employee_code, full_name, username, password, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (username)
     DO UPDATE SET
       employee_code = EXCLUDED.employee_code,
       full_name = EXCLUDED.full_name,
       password = EXCLUDED.password,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [code, fullName, username, hash, role, isActive]
  );
}

async function upsertCustomerUser(client, { customerName, displayName, username, password, isActive = true }) {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await client.query(
    `INSERT INTO customer_users(customer_name, username, password, display_name, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (username)
     DO UPDATE SET
       customer_name = EXCLUDED.customer_name,
       password = EXCLUDED.password,
       display_name = EXCLUDED.display_name,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [customerName, username, hash, displayName, isActive]
  );
}

async function ensureExpenseCategories(client) {
  const categories = [
    'Diesel / Fuel',
    'Vehicle Maintenance',
    'Labour Payment',
    'Loading / Unloading',
    'Office Expense',
    'Travel Expense',
    'Food / Refreshment',
    'Repair & Maintenance',
    'Utility Bills',
    'Miscellaneous'
  ];
  for (const name of categories) {
    await client.query(
      `INSERT INTO expense_categories(name, is_active)
       VALUES ($1, true)
       ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = NOW()`,
      [name]
    );
  }
}

async function getIdBy(client, query, params) {
  const r = await client.query(query, params);
  return r.rows[0]?.id || null;
}

async function seedTransportTrips(client) {
  await client.query(
    `DELETE FROM trips WHERE truck_number LIKE 'UAT-%'`
  );
  const rows = [
    ['UAT-GATE-01', 'IN_GATE', null, null, null, 'Dashmesh Minerals', 'Shree Ram Roadlines', 'Driver A', '9991110001', 'PSR'],
    ['UAT-TARE-01', 'SENT_FOR_TARE_WEIGHT', null, null, null, 'Bhagwat Minerals', 'Ganesh Road Lines', 'Driver B', '9991110002', 'PSR'],
    ['UAT-DISPATCH-01', 'AT_DISPATCH', 14.2, null, null, 'Kamdhenu Minerals', 'Kuber Roadlines', 'Driver C', '9991110003', 'PSR'],
    ['UAT-READY-01', 'READY_FOR_LOADING', 14.3, null, null, 'Ganesh Minerals', 'Amardeep Transport', 'Driver D', '9991110004', 'PSR'],
    ['UAT-LOAD-01', 'LOADING_IN_PROGRESS', 14.5, null, null, 'JMD', 'Shree Syam Transport', 'Driver E', '9991110005', 'PSR'],
    ['UAT-GROSS-01', 'GROSS_WEIGHT_PENDING', 14.8, null, null, 'RP Mines', 'Ravi Road Lines', 'Driver F', '9991110006', 'PSR'],
    ['UAT-BILL-01', 'BILLING_PENDING', 14.0, 39.2, 25.2, 'Jaipur Silica Sand Pvt Ltd', 'Shree Ram Roadlines', 'Driver G', '9991110007', 'PSR'],
    ['UAT-DONE-01', 'COMPLETED', 13.9, 38.0, 24.1, 'Silica Sand India Pvt Ltd', 'Ganesh Road Lines', 'Driver H', '9991110008', 'PSR']
  ];

  for (const [truck, status, tare, gross, net, customer, transporter, driver, phone, gate] of rows) {
    await client.query(
      `INSERT INTO trips(
        truck_number, customer_name, transporter, driver_name, driver_phone, gate_person_name,
        dispatch_manager_name, weight_operator_name, loading_person_name, accounts_person_name,
        dispatch_done_by, tare_done_by, gross_done_by, loading_done_by, billing_done_by,
        material_type, grade, condition, packing, loading_point, labour_team, eta, expected_weight,
        tare_weight, gross_weight, net_weight, status, final_status, in_time, out_time, last_status_update_time,
        rate_used_per_mt, gst_percent_used, taxable_amount, gst_amount, total_amount
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        'Jitendra Yadav','Anil Sharma','Rajesh Kumar','Ashutosh',
        'Jitendra Yadav','Anil Sharma','Anil Sharma','Rajesh Kumar','Ashutosh',
        'Silica Sand','Foundry Grade','Dry','Loose','Warehouse','JCB Loader',$7,$8,
        $9,$10,$11,$12,CASE WHEN $12='COMPLETED' THEN 'COMPLETED' ELSE NULL END,$13,$14,$15,
        1500,18,COALESCE($11::numeric,0::numeric)*1500,(COALESCE($11::numeric,0::numeric)*1500*18/100),((COALESCE($11::numeric,0::numeric)*1500)*1.18)
      )`,
      [
        truck, customer, transporter, driver, phone, gate,
        isoHoursAhead(2), 25.0,
        tare, gross, net, status,
        isoHoursAgo(4), status === 'COMPLETED' ? isoHoursAgo(1) : null, isoHoursAgo(0.5)
      ]
    );
  }
}

async function seedExpectedTrucks(client) {
  await client.query(`DELETE FROM expected_trucks WHERE truck_number LIKE 'UAT-%'`);
  const dashmeshId = await getIdBy(client, `SELECT id FROM customer_users WHERE username = 'dashmesh_m' LIMIT 1`, []);
  if (!dashmeshId) return;
  const rows = [
    ['UAT-EXP-01', 'Customer Driver 1', '9990001001', 'Shree Ram Roadlines', 24.5, 'Silica Sand', 'Foundry Grade', 'Dry', null, 'SUBMITTED'],
    ['UAT-EXP-02', 'Customer Driver 2', '9990001002', 'Ganesh Road Lines', 23.8, 'Silica Sand', 'Glass Grade', 'Dry', null, 'APPROVED'],
    ['UAT-EXP-03', 'Customer Driver 3', '9990001003', 'Kuber Roadlines', 22.2, 'Ball Clay', 'Raw', 'Wet', null, 'REVIEW_PENDING']
  ];
  for (const row of rows) {
    await client.query(
      `INSERT INTO expected_trucks(
        submitted_by_user_id, customer_name, truck_number, driver_name, driver_phone, transporter,
        expected_quantity_mt, material_type, grade, condition, packing, location, eta, notes,
        status, submitted_at, status_updated_at, updated_at, expires_at
      ) VALUES (
        $1,'Dashmesh Minerals',$2,$3,$4,$5,$6,$7,$8,$9,'Loose','Plant Gate',$10,'UAT seeded expected truck',
        $11,NOW(),NOW(),NOW(),NOW() + interval '24 hours'
      )`,
      [dashmeshId, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], isoHoursAhead(3), row[9]]
    );
  }
}

async function seedTasks(client) {
  await client.query(`DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE 'UAT %')`);
  await client.query(`DELETE FROM task_activity WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE 'UAT %')`);
  await client.query(`DELETE FROM task_notifications WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE 'UAT %')`);
  await client.query(`DELETE FROM tasks WHERE title LIKE 'UAT %'`);

  const tasks = [
    ['UAT Dispatch Hold', 'Validate loading point schedule', 'Dispatch', 'OPEN', 3],
    ['UAT Weighbridge Drift', 'Check tare calibration', 'Weighbridge', 'IN_PROGRESS', 6],
    ['UAT Accounts Reconcile', 'Match billing docs and trip totals', 'Accounts', 'OPEN', 8]
  ];
  for (const [title, description, team, status, etaHours] of tasks) {
    await client.query(
      `INSERT INTO tasks(title, description, team, assignee_name_snapshot, status, eta, created_by_role, created_by_name)
       VALUES ($1,$2,$3,'UAT Assignee',$4,$5,'Admin','UAT Seeder')`,
      [title, description, team, status, isoHoursAhead(etaHours)]
    );
  }
}

async function seedExpenseClaims(client) {
  await client.query(`DELETE FROM expense_claim_documents WHERE claim_id IN (SELECT id FROM expense_claims WHERE claim_number LIKE 'UAT-%')`);
  await client.query(`DELETE FROM expense_claim_history WHERE claim_id IN (SELECT id FROM expense_claims WHERE claim_number LIKE 'UAT-%')`);
  await client.query(`DELETE FROM expense_notifications WHERE entity_id IN (SELECT id FROM expense_claims WHERE claim_number LIKE 'UAT-%')`);
  await client.query(`DELETE FROM expense_claims WHERE claim_number LIKE 'UAT-%'`);

  const emp1 = await getIdBy(client, `SELECT id FROM expense_users WHERE username = 'emp1' LIMIT 1`, []);
  const acc = await getIdBy(client, `SELECT id FROM expense_users WHERE username = 'sso_accounts' LIMIT 1`, []);
  const mgr = await getIdBy(client, `SELECT id FROM expense_users WHERE username = 'sso_manager' LIMIT 1`, []);
  const adm = await getIdBy(client, `SELECT id FROM expense_users WHERE username = 'sso_admin' LIMIT 1`, []);
  const category = await getIdBy(client, `SELECT id FROM expense_categories WHERE name = 'Diesel / Fuel' LIMIT 1`, []);
  if (!emp1 || !category) return;

  const claims = [
    ['UAT-EXP-0001', 'ACCOUNTS_REVIEW', 'ACCOUNTS', null, 5200, 'Fuel topup', 'PAYMENT_PENDING'],
    ['UAT-EXP-0002', 'MANAGER_REVIEW', 'MANAGER', acc, 1800, 'Site travel', null],
    ['UAT-EXP-0003', 'ADMIN_REVIEW', 'ADMIN', mgr, 2400, 'Labour support', null],
    ['UAT-EXP-0004', 'PAYMENT_PENDING', 'ACCOUNTS', adm, 999, 'Repair consumables', null],
    ['UAT-EXP-0005', 'PAYMENT_INITIATED', 'ACCOUNTS', acc, 1600, 'Food refreshment', null],
    ['UAT-EXP-0006', 'NEED_MORE_INFO', 'Employee', mgr, 1100, 'Missing voucher details', null],
    ['UAT-EXP-0007', 'REJECTED', null, adm, 3000, 'Duplicate claim', null],
    ['UAT-EXP-0008', 'PAYMENT_COMPLETED', null, acc, 4500, 'Utility bill', null]
  ];

  let seq = 0;
  for (const [claimNumber, status, assignedRole, reviewerId, amount, purpose, forcedPrev] of claims) {
    seq += 1;
    const voucher = `UAT-VCH-${seq.toString().padStart(3, '0')}`;
    const date = new Date(Date.now() - seq * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const previousStatus =
      forcedPrev ||
      (status === 'MANAGER_REVIEW' ? 'ACCOUNTS_REVIEW' : status === 'ADMIN_REVIEW' ? 'MANAGER_REVIEW' : null);

    const insert = await client.query(
      `INSERT INTO expense_claims(
         claim_number, employee_id, pay_to, voucher_no, claim_date, amount, category_id, purpose,
         status, current_assigned_role, current_assigned_user_id, submitted_at,
         accounts_reviewed_by, manager_reviewed_by, admin_reviewed_by,
         payment_initiated_by, payment_completed_by, payment_initiated_at, payment_completed_at,
         rejection_reason, previous_status, previous_review_stage, more_info_requested_by_user_id, more_info_requested_by_role, more_info_reason
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,NOW(),
         $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
       ) RETURNING id`,
      [
        claimNumber, emp1, 'Vendor UAT', voucher, date, amount, category, purpose,
        status, assignedRole, reviewerId,
        status === 'MANAGER_REVIEW' || status === 'ADMIN_REVIEW' || status === 'PAYMENT_PENDING' || status === 'PAYMENT_INITIATED' || status === 'PAYMENT_COMPLETED' ? acc : null,
        status === 'ADMIN_REVIEW' || status === 'PAYMENT_PENDING' || status === 'PAYMENT_INITIATED' || status === 'PAYMENT_COMPLETED' ? mgr : null,
        status === 'PAYMENT_PENDING' || status === 'PAYMENT_INITIATED' || status === 'PAYMENT_COMPLETED' || status === 'REJECTED' ? adm : null,
        status === 'PAYMENT_INITIATED' || status === 'PAYMENT_COMPLETED' ? acc : null,
        status === 'PAYMENT_COMPLETED' ? acc : null,
        status === 'PAYMENT_INITIATED' || status === 'PAYMENT_COMPLETED' ? isoHoursAgo(8) : null,
        status === 'PAYMENT_COMPLETED' ? isoHoursAgo(2) : null,
        status === 'REJECTED' ? 'UAT rejection sample' : null,
        previousStatus,
        status === 'NEED_MORE_INFO' ? 'MANAGER_REVIEW' : null,
        status === 'NEED_MORE_INFO' ? mgr : null,
        status === 'NEED_MORE_INFO' ? 'Manager' : null,
        status === 'NEED_MORE_INFO' ? 'Please attach complete bill' : null
      ]
    );

    await client.query(
      `INSERT INTO expense_claim_history(
         claim_id, action_type, from_status, to_status, actor_user_id, actor_role, remarks, field_changes_json
       ) VALUES ($1,'UAT_SEED',NULL,$2,$3,$4,'Seeded UAT sample','{}'::jsonb)`,
      [insert.rows[0].id, status, reviewerId || emp1, reviewerId ? 'System' : 'Employee']
    );
  }
}

async function seedMasterAndUsers(client) {
  const materials = ['Silica Sand', 'Ball Clay'];
  const grades = [
    ['Foundry Grade', 1500],
    ['Glass Grade', 1625],
    ['30-80', 1425],
    ['Raw', 1200]
  ];
  const conditions = ['Dry', 'Wet'];
  const packing = ['Loose', 'Old', '3G', '4G'];
  const loadingPoints = ['Warehouse', 'Office Front', 'Glass Plant', 'Old Dry Plant'];
  const loadingTeams = ['JCB Loader', 'Dinesh', 'Rajesh Team', 'Shambhu'];
  const transporters = [
    'Shree Ram Roadlines',
    'Kuber Roadlines',
    'Ganesh Road Lines',
    'Amardeep Transport',
    'Shree Syam Transport',
    'Jambeshwar Road Lines',
    'Ravi Road Lines'
  ];

  for (const value of materials) await upsertMaster(client, 'materials', value, { price_per_mt: null });
  for (const [value, price] of grades) await upsertMaster(client, 'grades', value, { price_per_mt: price });
  for (const value of conditions) await upsertMaster(client, 'conditions', value);
  for (const value of packing) await upsertMaster(client, 'packing', value);
  for (const value of loadingPoints) await upsertMaster(client, 'loading_points', value);
  for (const value of loadingTeams) await upsertMaster(client, 'loading_teams', value);
  for (const value of transporters) await upsertMaster(client, 'transporters', value);

  await client.query(
    `INSERT INTO admin_settings(key, value_json, updated_at)
     VALUES ('pricing_defaults', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify({ default_gst_percent: 18 })]
  );

  const transportUsers = [
    { username: 'admin_role', fullName: 'Transport Admin', password: 'Admin@1234', roles: ['Admin'] },
    { username: 'accounts_role', fullName: 'Transport Accounts', password: 'Accounts@1234', roles: ['Accounts'] },
    { username: 'manager_role', fullName: 'Transport Manager', password: 'Manager@1234', roles: ['Manager'] },
    { username: 'dispatch_role', fullName: 'Transport Dispatch', password: 'Dispatch@1234', roles: ['Dispatch'] },
    { username: 'loading_role', fullName: 'Transport Loading', password: 'Loading@1234', roles: ['Loading'] },
    { username: 'weighbridge_role', fullName: 'Transport Weighbridge', password: 'Weighbridge@1234', roles: ['Weighbridge'] },
    { username: 'gate_role', fullName: 'Transport Gate', password: 'Gate@1234', roles: ['Gate'] },
    { username: 'psr', fullName: 'PSR', password: 'Gate@1234', roles: ['Gate'] }
  ];
  for (const user of transportUsers) {
    await upsertTransportUser(client, user);
  }

  const expenseUsers = [
    ['EMP001', 'Employee One', 'emp1', 'emp#4Pq1', 'Employee'],
    ['EMP002', 'Employee Two', 'emp2', 'emp#5Kr2', 'Employee'],
    ['EMP003', 'Employee Three', 'emp3', 'emp#6La3', 'Employee'],
    ['EMP004', 'Employee Four', 'emp4', 'emp#7Mx4', 'Employee'],
    ['EMP005', 'Employee Five', 'emp5', 'emp#8Ny5', 'Employee'],
    ['EMP006', 'Employee Six', 'emp6', 'emp#9Oz6', 'Employee'],
    ['EMP007', 'Employee Seven', 'emp7', 'emp#1Pa7', 'Employee'],
    ['EMP008', 'Employee Eight', 'emp8', 'emp#2Qb8', 'Employee'],
    ['EMP009', 'Employee Nine', 'emp9', 'emp#3Rc9', 'Employee'],
    ['EMP010', 'Employee Ten', 'emp10', 'emp#4Sd0', 'Employee'],
    ['SSO-ADMIN', 'Transport Admin SSO', 'sso_admin', 'adm#7Wn4', 'Admin'],
    ['SSO-ACCOUNTS', 'Transport Accounts SSO', 'sso_accounts', 'acc#8Vm3', 'Accounts'],
    ['SSO-MANAGER', 'Transport Manager SSO', 'sso_manager', 'mgr#9Tx2', 'Manager']
  ];
  for (const [code, fullName, username, password, role] of expenseUsers) {
    await upsertExpenseUser(client, { code, fullName, username, password, role, isActive: true });
  }

  const customers = [
    ['Dashmesh Minerals', 'Dashmesh Minerals', 'dashmesh_m', 'Da8@L2q7'],
    ['Bhagwat Minerals', 'Bhagwat Minerals', 'bhagwat_m', 'Bh7#N4p1'],
    ['Kamdhenu Minerals', 'Kamdhenu Minerals', 'kamdhenu_m', 'Km6@T8x2'],
    ['Ganesh Minerals', 'Ganesh Minerals', 'ganesh_m', 'Gn5!R3w9'],
    ['JMD', 'JMD', 'jmd_ops', 'Jm4$V6y8']
  ];
  for (const [customerName, displayName, username, password] of customers) {
    await upsertCustomerUser(client, { customerName, displayName, username, password, isActive: true });
  }
}

async function printSummary() {
  const [trips, expected, claims, tasks] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM trips WHERE truck_number LIKE 'UAT-%'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM expected_trucks WHERE truck_number LIKE 'UAT-%'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM expense_claims WHERE claim_number LIKE 'UAT-%' AND deleted_at IS NULL`),
    pool.query(`SELECT COUNT(*)::int AS c FROM tasks WHERE title LIKE 'UAT %'`)
  ]);
  console.log('UAT seed summary:');
  console.log(`- trips: ${trips.rows[0].c}`);
  console.log(`- expected_trucks: ${expected.rows[0].c}`);
  console.log(`- expense_claims: ${claims.rows[0].c}`);
  console.log(`- tasks: ${tasks.rows[0].c}`);
}

async function run() {
  const appEnv = String(process.env.APP_ENV || '').trim().toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  const dbUrl = String(process.env.DATABASE_URL || '');
  const dbUrlLc = dbUrl.toLowerCase();

  if (appEnv !== REQUIRED_APP_ENV) {
    console.error(`Refusing to seed. APP_ENV must be '${REQUIRED_APP_ENV}'. Current APP_ENV='${process.env.APP_ENV || ''}'`);
    process.exit(1);
  }
  if (nodeEnv === 'production') {
    console.error('Refusing to seed. NODE_ENV=production is blocked for this script.');
    process.exit(1);
  }
  if (!dbUrl) {
    console.error('Refusing to seed. DATABASE_URL is missing.');
    process.exit(1);
  }
  if (dbUrlLc.includes('prod') || dbUrlLc.includes('production')) {
    console.error('Refusing to seed. DATABASE_URL appears to target production.');
    process.exit(1);
  }
  if (process.env.CONFIRM_UAT_SEED !== 'YES') {
    console.error("Refusing to seed. Set CONFIRM_UAT_SEED=YES and APP_ENV=staging to run.");
    process.exit(1);
  }
  if (process.env.CONFIRM_DB_TARGET !== 'STAGING_DB') {
    console.error("Refusing to seed. Set CONFIRM_DB_TARGET=STAGING_DB after verifying 'npm run db:whereami'.");
    process.exit(1);
  }
  await initDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedMasterAndUsers(client);
    await ensureExpenseCategories(client);
    await seedTransportTrips(client);
    await seedExpectedTrucks(client);
    await seedExpenseClaims(client);
    await seedTasks(client);
    await client.query('COMMIT');
    await printSummary();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('UAT seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(async (error) => {
  console.error('UAT seed crashed:', error);
  try { await pool.end(); } catch {}
  process.exit(1);
});

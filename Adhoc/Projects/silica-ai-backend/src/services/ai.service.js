const { db } = require('../config/firebase');
const { runReadOnlySql } = require('./transportData.service');

const DEFAULT_MODEL = 'gpt-4.1-mini';
const MAX_QUESTION_LENGTH = 800;

function normalizeQuestion(value) {
  return String(value || '').trim().slice(0, MAX_QUESTION_LENGTH);
}

const REPORTING_SCHEMA = `
Approved PostgreSQL reporting views:

1. ai_transport_trips
Columns:
trip_id, sequence_number, truck_number, customer_name, transporter, material_type, grade, condition, packing, location, loading_point, labour_team, expected_weight, tare_weight, gross_weight, net_weight_mt, rate_per_mt, gst_percent, taxable_amount, gst_amount, total_amount, afs_value, status, final_status, is_cancelled, in_time, out_time, billing_calculated_at, created_at, updated_at, in_date_ist, out_date_ist, billing_date_ist, updated_date_ist.

Use ai_transport_trips for dispatch, trucks, customer sales, material movement, weights, billing, and monthly/daily sales. For "today" use CURRENT_DATE against *_date_ist fields. For sales, prefer billing_date_ist and total_amount/net_weight_mt. For dispatch today, prefer out_date_ist = CURRENT_DATE; if the user asks current dispatch pipeline, group by status.

2. ai_transport_expenses
Columns:
claim_id, claim_number, pay_to, voucher_no, claim_date, amount, purpose, status, current_assigned_role, submitted_at, payment_initiated_at, payment_completed_at, created_at, updated_at, deleted_at.

3. ai_transport_lab_reports
Columns:
report_id, report_number, trip_id, is_generic, truck_number, customer_name, loading_point, report_date, material_type, grade, sieve_size, afs_reference, total_quantity, total_product, total_afs, status, finalized_at, sample_type, sample_point, created_at, updated_at.

4. ai_transport_expected_trucks
Columns:
expected_truck_id, customer_name, truck_number, transporter, expected_quantity_mt, material_type, grade, condition, packing, location, eta, status, linked_trip_id, submitted_at, approved_at, expires_at, status_updated_at, status_updated_by, created_at, updated_at, eta_date_ist, submitted_date_ist.

Use this for expected arrivals, customer-submitted trucks, pending approvals, missed/expired expected trucks, and expected-vs-actual comparisons joined to ai_transport_trips on linked_trip_id = trip_id.

5. ai_transport_trip_events
Columns:
event_id, trip_id, actor_role, event_type, from_status, to_status, created_at, event_date_ist.

Use this for process movement, bottlenecks, status transition counts, and activity by role. Join to ai_transport_trips on trip_id when customer/truck context is needed.

6. ai_transport_tasks
Columns:
task_id, title, team, status, eta, created_by_role, created_at, updated_at, done_at, done_by_role, eta_date_ist, created_date_ist, done_date_ist.

Use this for pending work, overdue tasks, team workload, completed tasks, and ETA analysis.

7. ai_transport_task_activity
Columns:
activity_id, task_id, action_type, from_value, to_value, actor_role, created_at, activity_date_ist.

Use this for task activity trends and status movement. Join to ai_transport_tasks on task_id when needed.

8. ai_transport_expense_history
Columns:
history_id, claim_id, action_type, from_status, to_status, actor_role, created_at, actor_transport_role, history_date_ist.

Use this for expense workflow movement and approval bottlenecks. Join to ai_transport_expenses on claim_id when amount/status context is needed.

9. ai_transport_expense_categories
Columns:
category_id, name, is_active, created_at, updated_at.

Use this for expense category reference when needed.
`;

function extractJson(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw _error;
  }
}

function buildSqlPrompt(question) {
  return [
    {
      role: 'system',
      content: [
        'You generate safe PostgreSQL SELECT queries for a Director asking transport business questions.',
        'Use only the approved reporting views and columns listed below.',
        'Return only JSON in this exact shape: {"sql":"SELECT ...","reason":"short reason"}.',
        'Never use INSERT, UPDATE, DELETE, DDL, comments, multiple statements, raw base tables, or unapproved columns.',
        'Use concise aggregate queries for analysis questions. Add LIMIT 100 for row-list queries.',
        REPORTING_SCHEMA
      ].join('\n')
    },
    {
      role: 'user',
      content: question
    }
  ];
}

function buildAnswerPrompt(question, queryResult) {
  return [
    {
      role: 'system',
      content: [
        'You answer Director-level transport operations questions for Silica.',
        'Use only the SQL result data provided in this request.',
        'If the data is not enough, say what is missing instead of guessing.',
        'Be concise, factual, and include key numbers, dates, and group names used.',
        'Use Indian numbering style where helpful.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        question,
        data_scope: 'approved transport reporting SQL result',
        sql: queryResult.sql,
        row_count: queryResult.rowCount,
        rows: queryResult.rows
      })
    }
  ];
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content?.text) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

async function askQuestion({ question, user }) {
  const cleanQuestion = normalizeQuestion(question);
  if (!cleanQuestion) {
    const error = new Error('Question is required');
    error.status = 400;
    throw error;
  }

  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const startedAt = Date.now();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const sqlResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: buildSqlPrompt(cleanQuestion),
      temperature: 0.2,
      max_output_tokens: 450
    })
  });

  const sqlPayload = await sqlResponse.json().catch(() => ({}));
  if (!sqlResponse.ok) {
    const message = sqlPayload?.error?.message || `OpenAI request failed with status ${sqlResponse.status}`;
    const error = new Error(message);
    error.status = 502;
    throw error;
  }

  const sqlText = extractResponseText(sqlPayload);
  const sqlPlan = extractJson(sqlText);
  const queryResult = await runReadOnlySql(sqlPlan.sql);

  const answerResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: buildAnswerPrompt(cleanQuestion, queryResult),
      temperature: 0.2,
      max_output_tokens: 700
    })
  });

  const answerPayload = await answerResponse.json().catch(() => ({}));
  if (!answerResponse.ok) {
    const message = answerPayload?.error?.message || `OpenAI request failed with status ${answerResponse.status}`;
    const error = new Error(message);
    error.status = 502;
    throw error;
  }

  const answer = extractResponseText(answerPayload);
  if (!answer) {
    const error = new Error('OpenAI returned an empty answer');
    error.status = 502;
    throw error;
  }

  if (db) {
    await db.collection('aiQueryLogs').add({
      uid: user?.uid || null,
      roles: Array.isArray(user?.roles) ? user.roles : [],
      question: cleanQuestion,
      model,
      dataScope: 'transport_reporting_sql',
      sql: queryResult.sql,
      rowCount: queryResult.rowCount,
      latencyMs: Date.now() - startedAt,
      createdAt: new Date()
    });
  }

  return {
    answer,
    model,
    dataScope: 'transport_reporting_sql'
  };
}

module.exports = {
  askQuestion
};

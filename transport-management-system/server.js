require('dotenv').config();
const path = require('path');
const express = require('express');
const { initDb, pool } = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/trip', async (req, res) => {
  const {
    sequence_number,
    truck_number,
    customer_name,
    transporter,
    driver_name,
    driver_phone,
    gate_person_name,
    dispatch_manager_name,
    weight_operator_name,
    material_type,
    grade,
    loading_point,
    labour_team,
    eta,
    waiting_reason,
    tare_weight,
    gross_weight,
    net_weight,
    status,
    final_status,
    is_cancelled,
    cancel_reason,
    in_time,
    out_time,
    last_status_update_time
  } = req.body;

  const safeStatus = status || 'IN_GATE';
  // Use server time as canonical source to avoid client timezone skew.
  const safeInTime = new Date().toISOString();
  const safeLastStatusUpdateTime = last_status_update_time || safeInTime;
  const safeIsCancelled = is_cancelled ?? false;

  try {
    const result = await pool.query(
      `INSERT INTO trips(
        sequence_number,
        truck_number,
        customer_name,
        transporter,
        driver_name,
        driver_phone,
        gate_person_name,
        dispatch_manager_name,
        weight_operator_name,
        material_type,
        grade,
        loading_point,
        labour_team,
        eta,
        waiting_reason,
        tare_weight,
        gross_weight,
        net_weight,
        status,
        final_status,
        is_cancelled,
        cancel_reason,
        in_time,
        out_time,
        last_status_update_time
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      RETURNING *`,
      [
        sequence_number,
        truck_number,
        customer_name,
        transporter,
        driver_name,
        driver_phone,
        gate_person_name,
        dispatch_manager_name,
        weight_operator_name,
        material_type,
        grade,
        loading_point,
        labour_team,
        eta,
        waiting_reason,
        tare_weight,
        gross_weight,
        net_weight,
        safeStatus,
        final_status || null,
        safeIsCancelled,
        cancel_reason,
        safeInTime,
        out_time,
        safeLastStatusUpdateTime
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating trip', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

app.get('/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching trips', error);
    res.status(500).json({ error: 'Failed to load trips' });
  }
});

app.put('/trip/:id', async (req, res) => {
  const { id } = req.params;
  const allowedFields = [
    'sequence_number',
    'truck_number',
    'customer_name',
    'transporter',
    'driver_name',
    'driver_phone',
    'gate_person_name',
    'dispatch_manager_name',
    'weight_operator_name',
    'material_type',
    'grade',
    'loading_point',
    'labour_team',
    'eta',
    'waiting_reason',
    'tare_weight',
    'gross_weight',
    'net_weight',
    'status',
    'final_status',
    'is_cancelled',
    'cancel_reason',
    'in_time',
    'out_time',
    'last_status_update_time'
  ];

  const providedFields = allowedFields.filter((field) =>
    Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== undefined
  );

  if (providedFields.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  const setClause = providedFields
    .map((field, index) => `${field} = $${index + 1}`)
    .join(', ');
  const values = providedFields.map((field) => req.body[field]);

  try {
    const result = await pool.query(
      `UPDATE trips SET ${setClause} WHERE id = $${providedFields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating trip', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });

const Joi = require('joi');
const svc = require('./drying.service');
const { assignSchema, updateMoistureSchema, finishSchema, qcPassSchema, qcFailSchema } = require('./drying.validation');

function bad(res, e) { return res.status(400).json({ error: String(e?.message || e) }); }

async function assign(req, res) {
  const { error, value } = assignSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.assign(value, req.user.uid);
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function updateMoisture(req, res) {
  const { error, value } = updateMoistureSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.updateMoisture(req.params.id, value.moistureNow, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function finish(req, res) {
  const { error } = finishSchema.validate(req.body || {});
  if (error) return bad(res, error);
  try {
    const result = await svc.finish(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function qcPass(req, res) {
  const { error, value } = qcPassSchema.validate(req.body || {});
  if (error) return bad(res, error);
  try {
    const result = await svc.qcPass(req.params.id, value);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function qcFail(req, res) {
  const { error } = qcFailSchema.validate(req.body || {});
  if (error) return bad(res, error);
  try {
    const result = await svc.qcFail(req.params.id);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function pending(req, res) {
  try {
    const result = await svc.listPending();
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function history(req, res) {
  try {
    const result = await svc.listHistory();
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

module.exports = {
  assign,
  updateMoisture,
  finish,
  qcPass,
  qcFail,
  pending,
  history,
};

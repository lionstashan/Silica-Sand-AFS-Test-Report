const Joi = require('joi');
const svc = require('./production.service');

const createBody = Joi.object({
  plantId: Joi.number().integer().valid(1, 2, 3, 4, 5).required(),
  grade: Joi.string().min(1).required(),
  quantity: Joi.number().min(0).required(),
  operator: Joi.string().required(),
  shift: Joi.string().allow('').optional(),
  notes: Joi.string().allow('').optional(),
  timestamp: Joi.date().optional(),
});

async function create(req, res) {
  const { error, value } = createBody.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  try {
    const result = await svc.createLog(value, req.user.uid);
    return res.status(201).json(result);
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
}

async function daily(req, res) {
  try {
    const result = await svc.getDailyLogs();
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function byPlant(req, res) {
  try {
    const result = await svc.getByPlant(req.params.id);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function qcRequest(req, res) {
  try {
    const result = await svc.markQcRequest(req.params.id);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function qcPass(req, res) {
  try {
    const result = await svc.qcPass(req.params.id);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function qcFail(req, res) {
  try {
    const result = await svc.qcFail(req.params.id);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

module.exports = {
  create,
  daily,
  byPlant,
  qcRequest,
  qcPass,
  qcFail,
};

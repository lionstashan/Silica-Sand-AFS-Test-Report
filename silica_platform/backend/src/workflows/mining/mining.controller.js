const Joi = require('joi');
const service = require('./mining.service');
const { addDowntimeSchema } = require('../../tickets/tickets.validation');

function bad(res, e) { return res.status(400).json({ error: String(e?.message || e) }); }

const createBody = Joi.object({
  mineNumber: Joi.number().integer().min(1).max(3).required(),
  pitNumber: Joi.number().integer().min(1).max(4).required(),
  expectedDumpers: Joi.number().integer().min(0).default(0),
  machineOperator: Joi.string().required(),
  dumperOperators: Joi.array().items(Joi.string()).default([]),
  notes: Joi.string().allow('').default(''),
});

const completeBody = Joi.object({
  dumpersLoaded: Joi.number().integer().min(0).default(0),
  notes: Joi.string().allow('').default(''),
});

async function create(req, res) {
  const { error, value } = createBody.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await service.createMiningTask(value, req.user.uid);
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function start(req, res) {
  try {
    const result = await service.startMining(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function downtime(req, res) {
  const { error, value } = addDowntimeSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await service.addDowntime(req.params.id, value, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function resume(req, res) {
  try {
    const result = await service.resumeMining(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function complete(req, res) {
  const { error, value } = completeBody.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await service.completeMining(req.params.id, value, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

module.exports = {
  create,
  start,
  downtime,
  resume,
  complete,
};

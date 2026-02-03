const { addFreshSchema, addReadySchema, updateStockSchema, listQuerySchema } = require('./inventory.validation');
const svc = require('./inventory.service');

function bad(res, e) { return res.status(400).json({ error: String(e?.message || e) }); }

async function listFresh(req, res) {
  try {
    const data = await svc.getFreshStockList();
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

async function listReady(req, res) {
  try {
    const data = await svc.getReadyStockList();
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

async function addFresh(req, res) {
  const { error, value } = addFreshSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.incrementFreshStock({ ...value, userId: req.user.uid });
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function addReady(req, res) {
  const { error, value } = addReadySchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.incrementReadyStock({ ...value, userId: req.user.uid });
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function updateFresh(req, res) {
  const { error, value } = updateStockSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.setFreshStockQuantity(req.params.id, value.quantity, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function updateReady(req, res) {
  const { error, value } = updateStockSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.setReadyStockQuantity(req.params.id, value.quantity, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function movements(req, res) {
  const { error, value } = listQuerySchema.validate(req.query);
  if (error) return bad(res, error);
  try {
    const data = await svc.listMovements(value.limit);
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

module.exports = {
  listFresh,
  listReady,
  addFresh,
  addReady,
  updateFresh,
  updateReady,
  movements,
};

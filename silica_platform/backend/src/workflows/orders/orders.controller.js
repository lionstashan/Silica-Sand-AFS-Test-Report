const { createSchema, prioritizeSchema, allocateSchema, historyQuerySchema } = require('./orders.validation');
const svc = require('./orders.service');

function bad(res, e) { return res.status(400).json({ error: String(e?.message || e) }); }

async function create(req, res) {
  const { error, value } = createSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.createOrder({ ...value, userId: req.user.uid });
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function approve(req, res) {
  try {
    const result = await svc.approveOrder(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function prioritize(req, res) {
  const { error, value } = prioritizeSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.prioritizeOrder(req.params.id, value.priority, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function outstanding(req, res) {
  try {
    const data = await svc.listOutstanding();
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

async function queue(req, res) {
  try {
    const data = await svc.listQueue();
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

async function allocate(req, res) {
  const { error, value } = allocateSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.allocate({ ...value, userId: req.user.uid });
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function reallocate(req, res) {
  try {
    const { toOrderId, quantity, grade } = req.body || {};
    if (!toOrderId || !quantity || grade === undefined) return bad(res, new Error('toOrderId, quantity, grade required'));
    const result = await svc.reallocate({ fromOrderId: req.params.id, toOrderId, quantity, grade, userId: req.user.uid });
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function history(req, res) {
  const { error, value } = historyQuerySchema.validate(req.query);
  if (error) return bad(res, error);
  try {
    const data = await svc.listHistory(value);
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

async function getOne(req, res) {
  try {
    const data = await svc.getOrderById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Order not found' });
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

module.exports = {
  create,
  approve,
  prioritize,
  outstanding,
  queue,
  allocate,
  reallocate,
  history,
  getOne,
};

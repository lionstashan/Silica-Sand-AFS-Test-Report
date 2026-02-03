const { assignSchema, vehicleSchema } = require('./dispatch.validation');
const svc = require('./dispatch.service');

function bad(res, e) { return res.status(400).json({ error: String(e?.message || e) }); }

async function assign(req, res) {
  const { error, value } = assignSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.assignDispatch({ ...value, userId: req.user.uid });
    return res.status(201).json(result);
  } catch (e) { return bad(res, e); }
}

async function vehicle(req, res) {
  const { error, value } = vehicleSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.assignVehicle(req.params.id, { ...value, userId: req.user.uid });
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function arrived(req, res) {
  try {
    const result = await svc.markArrived(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function loading(req, res) {
  try {
    const result = await svc.markLoading(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function complete(req, res) {
  try {
    const result = await svc.completeDispatch(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function pending(req, res) {
  try {
    const data = await svc.listPending();
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

async function history(req, res) {
  try {
    const data = await svc.listHistory();
    return res.json(data);
  } catch (e) { return bad(res, e); }
}

module.exports = {
  assign,
  vehicle,
  arrived,
  loading,
  complete,
  pending,
  history,
};

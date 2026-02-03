const { requestSchema } = require('./qc.validation');
const svc = require('./qc.service');

async function request(req, res) {
  const { error, value } = requestSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  try {
    const result = await svc.requestQc(value, req.user.uid);
    return res.status(201).json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function start(req, res) {
  try {
    const result = await svc.startQc(req.params.id, req.user.uid);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function pass(req, res) {
  try {
    const result = await svc.passQc(req.params.id);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function fail(req, res) {
  try {
    const result = await svc.failQc(req.params.id);
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function pending(req, res) {
  try {
    const result = await svc.listPending();
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

async function history(req, res) {
  try {
    const result = await svc.listHistory();
    return res.json(result);
  } catch (e) { return res.status(400).json({ error: String(e?.message || e) }); }
}

module.exports = {
  request,
  start,
  pass,
  fail,
  pending,
  history,
};

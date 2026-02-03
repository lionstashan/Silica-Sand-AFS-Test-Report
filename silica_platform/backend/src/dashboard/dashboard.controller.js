const svc = require('./dashboard.service');

async function summary(req, res) {
  try {
    const data = await svc.getSummary();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}

async function mining(req, res) {
  try { return res.json(await svc.getMiningSummary()); } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
}
async function production(req, res) {
  try { return res.json(await svc.getProductionSummary()); } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
}
async function drying(req, res) {
  try { return res.json(await svc.getDryingSummary()); } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
}
async function inventory(req, res) {
  try { return res.json(await svc.getInventorySummary()); } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
}
async function orders(req, res) {
  try { return res.json(await svc.getOrdersSummary()); } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
}
async function dispatch(req, res) {
  try { return res.json(await svc.getDispatchSummary()); } catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
}

module.exports = {
  summary,
  mining,
  production,
  drying,
  inventory,
  orders,
  dispatch,
};

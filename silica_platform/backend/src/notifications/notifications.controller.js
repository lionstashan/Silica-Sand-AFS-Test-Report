const { registerTokenSchema, sendSchema, sendMultipleSchema } = require('./notifications.validation');
const svc = require('./notifications.service');

function bad(res, e) { return res.status(400).json({ error: String(e?.message || e) }); }

async function registerToken(req, res) {
  const { error, value } = registerTokenSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.registerToken(req.user.uid, value.token);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function send(req, res) {
  const { error, value } = sendSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.sendToUser(value.uid, value.title, value.body, value.data || {}, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

async function sendMultiple(req, res) {
  const { error, value } = sendMultipleSchema.validate(req.body);
  if (error) return bad(res, error);
  try {
    const result = await svc.sendToMultiple(value.uids, value.title, value.body, value.data || {}, req.user.uid);
    return res.json(result);
  } catch (e) { return bad(res, e); }
}

module.exports = {
  registerToken,
  send,
  sendMultiple,
};

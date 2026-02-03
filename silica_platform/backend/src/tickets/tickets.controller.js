const { createTicketSchema, updateStatusSchema, addDowntimeSchema } = require('./tickets.validation');
const service = require('./tickets.service');

function badRequest(res, details) {
  return res.status(400).json({ error: 'Bad request', details });
}

async function createTicket(req, res) {
  const { error, value } = createTicketSchema.validate(req.body);
  if (error) return badRequest(res, error.message);
  try {
    const created = await service.createTicket(value, req.user.uid);
    return res.status(201).json(created);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create ticket', details: String(e?.message || e) });
  }
}

async function listTickets(req, res) {
  try {
    const { userId, department, limit } = req.query;
    if (userId) {
      const data = await service.getTicketsByUser(userId, { limit: Number(limit) || 50 });
      return res.json(data);
    }
    if (department) {
      const data = await service.getTicketsByDepartment(department, { limit: Number(limit) || 50 });
      return res.json(data);
    }
    // default: user assigned
    const data = await service.getTicketsByUser(req.user.uid, { limit: Number(limit) || 50 });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list tickets', details: String(e?.message || e) });
  }
}

async function getTicket(req, res) {
  try {
    const data = await service.getTicketById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get ticket', details: String(e?.message || e) });
  }
}

async function patchStatus(req, res) {
  const { error } = updateStatusSchema.validate(req.body);
  if (error) return badRequest(res, error.message);
  try {
    const { status } = req.body;
    const updated = await service.updateTicketStatus(req.params.id, status, req.user.uid);
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: 'Failed to update status', details: String(e?.message || e) });
  }
}

async function addDowntime(req, res) {
  const { error, value } = addDowntimeSchema.validate(req.body);
  if (error) return badRequest(res, error.message);
  try {
    const updated = await service.addDowntime(req.params.id, value, req.user.uid);
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: 'Failed to add downtime', details: String(e?.message || e) });
  }
}

async function resumeFromDowntime(req, res) {
  try {
    const updated = await service.resumeFromDowntime(req.params.id, req.user.uid);
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: 'Failed to resume', details: String(e?.message || e) });
  }
}

async function completeTicket(req, res) {
  try {
    const updated = await service.completeTicket(req.params.id, req.user.uid);
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: 'Failed to complete', details: String(e?.message || e) });
  }
}

module.exports = {
  createTicket,
  listTickets,
  getTicket,
  patchStatus,
  addDowntime,
  resumeFromDowntime,
  completeTicket,
};

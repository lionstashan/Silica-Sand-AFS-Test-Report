const Joi = require('joi');

const departments = ['mining', 'production', 'dispatch', 'qc', 'accounts'];

const createTicketSchema = Joi.object({
  department: Joi.string().valid(...departments).required(),
  assignedTo: Joi.string().optional(),
  metadata: Joi.object().unknown(true).default({}),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('Open', 'InProgress', 'Downtime', 'Resume', 'Completing', 'Completed', 'Closed').required(),
});

const addDowntimeSchema = Joi.object({
  reason: Joi.string().min(2).required(),
  notes: Joi.string().allow('').optional(),
});

module.exports = {
  createTicketSchema,
  updateStatusSchema,
  addDowntimeSchema,
};

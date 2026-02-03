const Joi = require('joi');

const assignSchema = Joi.object({
  orderId: Joi.string().optional(),
  ticketId: Joi.string().optional(),
  grade: Joi.alternatives(Joi.string(), Joi.number()).required(),
  quantity: Joi.number().positive().required(),
  assignedTo: Joi.string().optional(),
  notes: Joi.string().allow('', null).optional(),
});

const vehicleSchema = Joi.object({
  vehicleNumber: Joi.string().min(2).required(),
  driverName: Joi.string().min(2).required(),
});

module.exports = {
  assignSchema,
  vehicleSchema,
};

const Joi = require('joi');

const createSchema = Joi.object({
  companyName: Joi.string().min(2).required(),
  grade: Joi.alternatives(Joi.string(), Joi.number()).required(),
  totalQuantity: Joi.number().positive().required(),
  truckType: Joi.alternatives(Joi.string(), Joi.number()).optional(),
  packaging: Joi.string().valid('loose', 'bag', 'jumbo').required(),
  dryOrAfs: Joi.string().valid('dry', 'afs').required(),
  shipTo: Joi.string().min(2).required(),
  priority: Joi.number().integer().min(0).default(0),
  notes: Joi.string().allow('', null).optional(),
});

const prioritizeSchema = Joi.object({
  priority: Joi.number().integer().min(0).required(),
});

const allocateSchema = Joi.object({
  orderId: Joi.string().required(),
  quantity: Joi.number().positive().required(),
});

const historyQuerySchema = Joi.object({
  company: Joi.string().optional(),
  grade: Joi.alternatives(Joi.string(), Joi.number()).optional(),
  status: Joi.string().optional(),
});

module.exports = {
  createSchema,
  prioritizeSchema,
  allocateSchema,
  historyQuerySchema,
};

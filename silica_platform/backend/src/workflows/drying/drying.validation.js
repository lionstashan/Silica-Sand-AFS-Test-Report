const Joi = require('joi');

const assignSchema = Joi.object({
  dryingBedId: Joi.number().integer().min(1).max(4).required(),
  productionId: Joi.string().optional(),
  wetQuantity: Joi.number().positive().required(),
  grade: Joi.string().min(1).required(),
  moistureStart: Joi.number().min(0).max(100).required(),
  operator: Joi.string().required(),
  notes: Joi.string().allow('').optional(),
});

const updateMoistureSchema = Joi.object({
  moistureNow: Joi.number().min(0).max(100).required(),
});

const finishSchema = Joi.object({});

const qcPassSchema = Joi.object({
  qcReportId: Joi.string().optional(),
});

const qcFailSchema = Joi.object({});

module.exports = {
  assignSchema,
  updateMoistureSchema,
  finishSchema,
  qcPassSchema,
  qcFailSchema,
};

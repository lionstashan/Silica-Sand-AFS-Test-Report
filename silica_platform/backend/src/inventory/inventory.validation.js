const Joi = require('joi');

const addFreshSchema = Joi.object({
  plantId: Joi.number().integer().min(1).max(5).optional(),
  grade: Joi.string().when('plantId', { is: Joi.exist(), then: Joi.required(), otherwise: Joi.optional() }),
  mineNumber: Joi.number().integer().min(1).max(3).optional(),
  pitNumber: Joi.number().integer().min(1).max(4).optional(),
  quantity: Joi.number().positive().required(),
  referenceId: Joi.string().allow('').optional(),
  source: Joi.string().valid('mining', 'production', 'qc', 'drying', 'dispatch', 'manual').default('manual'),
}).custom((v, h) => {
  const plantMode = v.plantId !== undefined;
  const mineMode = v.mineNumber !== undefined || v.pitNumber !== undefined;
  if (!plantMode && !mineMode) return h.error('any.custom', 'Provide either plantId+grade or mineNumber+pitNumber');
  if (plantMode && mineMode) return h.error('any.custom', 'Provide only one of plant or mine/pit');
  if (mineMode && (v.mineNumber === undefined || v.pitNumber === undefined)) return h.error('any.custom', 'mineNumber and pitNumber are both required');
  return v;
});

const addReadySchema = Joi.object({
  grade: Joi.string().required(),
  quantity: Joi.number().positive().required(),
  referenceId: Joi.string().allow('').optional(),
  source: Joi.string().valid('mining', 'production', 'qc', 'drying', 'dispatch', 'manual').default('manual'),
});

const updateStockSchema = Joi.object({
  quantity: Joi.number().min(0).required(),
  referenceId: Joi.string().allow('').optional(),
  source: Joi.string().valid('manual').default('manual'),
});

const listQuerySchema = Joi.object({ limit: Joi.number().integer().min(1).max(500).default(100) });

module.exports = {
  addFreshSchema,
  addReadySchema,
  updateStockSchema,
  listQuerySchema,
};

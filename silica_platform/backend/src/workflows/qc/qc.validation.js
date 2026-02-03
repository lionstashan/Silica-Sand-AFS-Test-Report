const Joi = require('joi');

const baseMeasurements = {
  grade: Joi.string().min(1).required(),
  moisture: Joi.number().min(0).max(100).required(),
  afs: Joi.number().min(0).required(),
  fm: Joi.number().min(0).required(),
  comments: Joi.string().allow('').optional(),
};

const requestSchema = Joi.object({
  productionId: Joi.string().optional(),
  dryingBedId: Joi.string().optional(),
  ...baseMeasurements,
}).custom((value, helpers) => {
  if (!value.productionId && !value.dryingBedId) {
    return helpers.error('any.custom', 'Either productionId or dryingBedId must be provided');
  }
  if (value.productionId && value.dryingBedId) {
    return helpers.error('any.custom', 'Provide only one of productionId or dryingBedId');
  }
  return value;
}, 'QC linkage validation');

module.exports = {
  requestSchema,
};

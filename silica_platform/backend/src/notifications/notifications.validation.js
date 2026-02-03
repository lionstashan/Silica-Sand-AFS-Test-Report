const Joi = require('joi');

const registerTokenSchema = Joi.object({
  token: Joi.string().min(10).required(),
});

const sendSchema = Joi.object({
  uid: Joi.string().required(),
  title: Joi.string().min(1).required(),
  body: Joi.string().min(1).required(),
  data: Joi.object().unknown(true).default({}),
});

const sendMultipleSchema = Joi.object({
  uids: Joi.array().items(Joi.string()).min(1).required(),
  title: Joi.string().min(1).required(),
  body: Joi.string().min(1).required(),
  data: Joi.object().unknown(true).default({}),
});

module.exports = {
  registerTokenSchema,
  sendSchema,
  sendMultipleSchema,
};

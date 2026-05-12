require('dotenv').config();

const DEFAULTS = {
  CUSTOMER_TOKEN_SECRET: 'change-me-customer-token-secret',
  EXPENSE_TOKEN_SECRET: 'change-me-expense-token-secret',
  TRANSPORT_TOKEN_SECRET: 'change-me-transport-token-secret'
};

const DEFAULT_ROLE_PINS = {
  Gate: 'G8P2',
  Weighbridge: 'W3K7',
  Dispatch: 'D9M4',
  Loading: 'L5Q8',
  Accounts: 'A6R1',
  Manager: 'M2N6',
  Admin: '2802'
};

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getRolePins() {
  return {
    Gate: process.env.ROLE_PIN_GATE || DEFAULT_ROLE_PINS.Gate,
    Weighbridge: process.env.ROLE_PIN_WEIGHBRIDGE || DEFAULT_ROLE_PINS.Weighbridge,
    Dispatch: process.env.ROLE_PIN_DISPATCH || DEFAULT_ROLE_PINS.Dispatch,
    Loading: process.env.ROLE_PIN_LOADING || DEFAULT_ROLE_PINS.Loading,
    Accounts: process.env.ROLE_PIN_ACCOUNTS || DEFAULT_ROLE_PINS.Accounts,
    Manager: process.env.ROLE_PIN_MANAGER || DEFAULT_ROLE_PINS.Manager,
    Admin: process.env.ROLE_PIN_ADMIN || DEFAULT_ROLE_PINS.Admin
  };
}

const appConfig = {
  flags: {
    enableUserAuthV2: toBoolean(process.env.ENABLE_USER_AUTH_V2, false),
    enableAdminPanelV2: toBoolean(process.env.ENABLE_ADMIN_PANEL_V2, false)
  },
  secrets: {
    customerTokenSecret: String(process.env.CUSTOMER_TOKEN_SECRET || DEFAULTS.CUSTOMER_TOKEN_SECRET),
    expenseTokenSecret: String(process.env.EXPENSE_TOKEN_SECRET || DEFAULTS.EXPENSE_TOKEN_SECRET),
    transportTokenSecret: String(process.env.TRANSPORT_TOKEN_SECRET || DEFAULTS.TRANSPORT_TOKEN_SECRET)
  },
  rolePins: getRolePins()
};

function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const errors = [];

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL must be set in production.');
  }
  if (appConfig.secrets.customerTokenSecret === DEFAULTS.CUSTOMER_TOKEN_SECRET) {
    errors.push('CUSTOMER_TOKEN_SECRET is using default value.');
  }
  if (appConfig.secrets.expenseTokenSecret === DEFAULTS.EXPENSE_TOKEN_SECRET) {
    errors.push('EXPENSE_TOKEN_SECRET is using default value.');
  }
  if (appConfig.secrets.transportTokenSecret === DEFAULTS.TRANSPORT_TOKEN_SECRET) {
    errors.push('TRANSPORT_TOKEN_SECRET is using default value.');
  }

  Object.entries(appConfig.rolePins).forEach(([role, pin]) => {
    if (pin === DEFAULT_ROLE_PINS[role]) {
      errors.push(`ROLE_PIN_${role.toUpperCase()} is using default value.`);
    }
  });

  if (errors.length) {
    throw new Error(`Production configuration validation failed:\n- ${errors.join('\n- ')}`);
  }
}

module.exports = {
  appConfig,
  DEFAULT_ROLE_PINS,
  validateProductionConfig
};

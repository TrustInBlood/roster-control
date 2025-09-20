const { logger } = require('./logger');

class EnvValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'EnvValidationError';
    this.errors = errors;
  }
}

class EnvironmentValidator {
  constructor() {
    this.rules = new Map();
    this.logger = logger.child({ service: 'EnvValidator' });
  }

  addRule(name, rule) {
    this.rules.set(name, rule);
    return this;
  }

  required(name, options = {}) {
    return this.addRule(name, {
      type: 'required',
      validator: (value) => value !== undefined && value !== '',
      message: options.message || `${name} is required`,
      ...options
    });
  }

  string(name, options = {}) {
    return this.addRule(name, {
      type: 'string',
      validator: (value) => typeof value === 'string',
      message: options.message || `${name} must be a string`,
      ...options
    });
  }

  number(name, options = {}) {
    return this.addRule(name, {
      type: 'number',
      validator: (value) => !isNaN(parseInt(value)),
      transform: (value) => parseInt(value),
      message: options.message || `${name} must be a valid number`,
      ...options
    });
  }

  port(name, options = {}) {
    return this.addRule(name, {
      type: 'port',
      validator: (value) => {
        const port = parseInt(value);
        return !isNaN(port) && port >= 1 && port <= 65535;
      },
      transform: (value) => parseInt(value),
      message: options.message || `${name} must be a valid port number (1-65535)`,
      ...options
    });
  }

  oneOf(name, validValues, options = {}) {
    return this.addRule(name, {
      type: 'oneOf',
      validator: (value) => validValues.includes(value),
      message: options.message || `${name} must be one of: ${validValues.join(', ')}`,
      validValues,
      ...options
    });
  }

  optional(name, rule) {
    const existingRule = this.rules.get(name) || rule;
    existingRule.optional = true;
    return this.addRule(name, existingRule);
  }

  defaultValue(name, defaultVal) {
    const rule = this.rules.get(name);
    if (rule) {
      rule.default = defaultVal;
    }
    return this;
  }

  validate() {
    const errors = [];
    const validated = {};

    for (const [name, rule] of this.rules) {
      const envValue = process.env[name];

      try {
        if (envValue === undefined || envValue === '') {
          if (rule.optional) {
            if (rule.default !== undefined) {
              validated[name] = rule.default;
              this.logger.debug(`Using default value for ${name}`, { default: rule.default });
            }
            continue;
          } else {
            errors.push({
              variable: name,
              error: rule.message || `${name} is required`,
              type: 'missing'
            });
            continue;
          }
        }

        if (!rule.validator(envValue)) {
          errors.push({
            variable: name,
            error: rule.message,
            value: envValue,
            type: 'invalid'
          });
          continue;
        }

        const finalValue = rule.transform ? rule.transform(envValue) : envValue;
        validated[name] = finalValue;

        this.logger.debug(`Validated environment variable: ${name}`, {
          type: rule.type,
          value: name.includes('TOKEN') || name.includes('PASSWORD') ? '[REDACTED]' : finalValue
        });

      } catch (error) {
        errors.push({
          variable: name,
          error: `Validation error: ${error.message}`,
          value: envValue,
          type: 'error'
        });
      }
    }

    if (errors.length > 0) {
      this.logger.error('Environment validation failed', {
        errorCount: errors.length,
        errors: errors.map(e => ({ variable: e.variable, type: e.type, error: e.error }))
      });
      throw new EnvValidationError('Environment validation failed', errors);
    }

    this.logger.info('Environment validation passed', {
      validatedCount: Object.keys(validated).length
    });

    return validated;
  }

  generateReport() {
    const report = {
      required: [],
      optional: [],
      current: []
    };

    for (const [name, rule] of this.rules) {
      const envValue = process.env[name];
      const item = {
        name,
        type: rule.type,
        required: !rule.optional,
        hasValue: envValue !== undefined && envValue !== '',
        hasDefault: rule.default !== undefined
      };

      if (rule.optional) {
        report.optional.push(item);
      } else {
        report.required.push(item);
      }

      if (item.hasValue) {
        report.current.push({
          name,
          type: rule.type,
          valueLength: envValue?.length || 0,
          isRedacted: name.includes('TOKEN') || name.includes('PASSWORD')
        });
      }
    }

    return report;
  }
}

function createCoreValidator() {
  return new EnvironmentValidator()
    .required('DISCORD_TOKEN')
    .required('DISCORD_CLIENT_ID')
    .required('DISCORD_GUILD_ID')
    .required('DB_HOST')
    .port('DB_PORT').defaultValue(3306)
    .required('DB_NAME')
    .required('DB_USER')
    .required('DB_PASSWORD')
    .optional('BATTLEMETRICS_TOKEN')
    .optional('BATTLEMETRICS_BANLIST_ID')
    .optional('SQUADJS_HOST').defaultValue('localhost')
    .port('SQUADJS_PORT').optional().defaultValue(3000)
    .optional('SQUADJS_PASSWORD')
    .optional('SQUADJS_TOKEN_SERVER1')
    .optional('SQUADJS_TOKEN_SERVER2')
    .optional('SQUADJS_TOKEN_SERVER3')
    .optional('SQUADJS_TOKEN_SERVER4')
    .optional('SQUADJS_TOKEN_SERVER5')
    .port('HTTP_PORT').optional().defaultValue(3001)
    .oneOf('LOG_LEVEL', ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).optional().defaultValue('info')
    .oneOf('NODE_ENV', ['development', 'production', 'test']).optional().defaultValue('development');
}

module.exports = {
  EnvironmentValidator,
  EnvValidationError,
  createCoreValidator,
  validateEnvironment: () => createCoreValidator().validate(),
  generateEnvironmentReport: () => createCoreValidator().generateReport()
};
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

  optional(name, rule = {}) {
    // If called without arguments or with just a rule object, mark the last added rule as optional
    if (arguments.length === 0 || (arguments.length === 1 && typeof name === 'object')) {
      const lastRuleName = Array.from(this.rules.keys()).pop();
      const lastRule = this.rules.get(lastRuleName);
      if (lastRule) {
        lastRule.optional = true;
      }
      return this;
    }

    const existingRule = this.rules.get(name);
    if (existingRule) {
      existingRule.optional = true;
      return this;
    }

    // If no existing rule, create a basic string validation rule
    const newRule = {
      type: rule.type || 'string',
      validator: rule.validator || ((value) => typeof value === 'string'),
      message: rule.message || `${name} must be a string`,
      optional: true,
      ...rule
    };
    return this.addRule(name, newRule);
  }

  defaultValue(name, defaultVal) {
    // Support defaultValue called with single argument (assumes last rule)
    if (arguments.length === 1) {
      defaultVal = name;
      // Get the last added rule
      const lastRuleName = Array.from(this.rules.keys()).pop();
      const rule = this.rules.get(lastRuleName);
      if (rule) {
        rule.default = defaultVal;
      }
    } else {
      const rule = this.rules.get(name);
      if (rule) {
        rule.default = defaultVal;
      }
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
  const validator = new EnvironmentValidator();

  // Required Discord configuration
  validator.required('DISCORD_TOKEN');
  validator.required('DISCORD_CLIENT_ID');
  validator.required('DISCORD_GUILD_ID');

  // Required Database configuration
  validator.required('DB_HOST');
  validator.port('DB_PORT').defaultValue(3306);
  validator.required('DB_NAME');
  validator.required('DB_USER');
  validator.required('DB_PASSWORD');

  // Optional BattleMetrics configuration
  validator.optional('BATTLEMETRICS_TOKEN');
  validator.optional('BATTLEMETRICS_BANLIST_ID');

  // Optional SquadJS configuration
  validator.optional('SQUADJS_HOST').defaultValue('localhost');
  validator.port('SQUADJS_PORT').optional().defaultValue(3000);
  validator.optional('SQUADJS_PASSWORD');
  validator.optional('SQUADJS_TOKEN_SERVER1');
  validator.optional('SQUADJS_TOKEN_SERVER2');
  validator.optional('SQUADJS_TOKEN_SERVER3');
  validator.optional('SQUADJS_TOKEN_SERVER4');
  validator.optional('SQUADJS_TOKEN_SERVER5');

  // Optional HTTP configuration
  validator.port('HTTP_PORT').optional().defaultValue(3001);

  // Optional logging configuration
  validator.oneOf('LOG_LEVEL', ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).optional().defaultValue('info');

  // Optional environment configuration
  validator.oneOf('NODE_ENV', ['development', 'production', 'test']).optional().defaultValue('development');

  return validator;
}

module.exports = {
  EnvironmentValidator,
  EnvValidationError,
  createCoreValidator,
  validateEnvironment: () => createCoreValidator().validate(),
  generateEnvironmentReport: () => createCoreValidator().generateReport()
};
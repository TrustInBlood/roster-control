/**
 * Service Container
 * Centralized dependency injection container to replace global state pollution
 * Manages service lifecycle and provides type-safe service registration
 */

const { logger } = require('../utils/logger');

class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.logger = logger.child({ service: 'ServiceContainer' });
  }

  /**
   * Register a service factory function
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that creates the service
   * @param {Object} options - Registration options
   * @param {boolean} options.singleton - Whether service should be singleton
   */
  register(name, factory, options = {}) {
    if (this.services.has(name)) {
      this.logger.warn(`Service '${name}' already registered, overwriting`);
    }

    this.services.set(name, {
      factory,
      singleton: options.singleton || false,
      dependencies: options.dependencies || []
    });

    this.logger.debug(`Registered service: ${name}`, {
      singleton: options.singleton,
      dependencies: options.dependencies
    });
  }

  /**
   * Register a singleton service instance
   * @param {string} name - Service name
   * @param {*} instance - Service instance
   */
  registerInstance(name, instance) {
    this.singletons.set(name, instance);
    this.logger.debug(`Registered singleton instance: ${name}`);
  }

  /**
   * Get a service instance
   * @param {string} name - Service name
   * @returns {*} Service instance
   */
  get(name) {
    // Check if singleton instance already exists
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Check if service is registered
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not found in container`);
    }

    const serviceConfig = this.services.get(name);

    try {
      // Resolve dependencies
      const dependencies = serviceConfig.dependencies.map(dep => this.get(dep));

      // Create service instance
      const instance = serviceConfig.factory(...dependencies);

      // Store as singleton if configured
      if (serviceConfig.singleton) {
        this.singletons.set(name, instance);
      }

      this.logger.debug(`Created service instance: ${name}`);
      return instance;
    } catch (error) {
      this.logger.error(`Failed to create service '${name}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name) || this.singletons.has(name);
  }

  /**
   * Get all registered service names
   * @returns {string[]}
   */
  getServiceNames() {
    return [...this.services.keys(), ...this.singletons.keys()];
  }

  /**
   * Clear all services (for testing)
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.logger.debug('Service container cleared');
  }

  /**
   * Gracefully shutdown all services that have cleanup methods
   */
  async shutdown() {
    this.logger.info('Shutting down services...');

    const shutdownPromises = [];

    // Shutdown singleton instances
    for (const [name, instance] of this.singletons) {
      if (instance && typeof instance.shutdown === 'function') {
        this.logger.debug(`Shutting down service: ${name}`);
        shutdownPromises.push(
          Promise.resolve(instance.shutdown()).catch(error => {
            this.logger.error(`Error shutting down service '${name}': ${error.message}`);
          })
        );
      }
    }

    await Promise.all(shutdownPromises);
    this.logger.info('Service shutdown complete');
  }
}

// Global service container instance
const container = new ServiceContainer();

/**
 * Verification service to replace global.pendingVerifications
 */
class VerificationService {
  constructor() {
    this.pendingVerifications = new Map();
    this.logger = logger.child({ service: 'VerificationService' });
  }

  /**
   * Add a pending verification
   * @param {string} code - Verification code
   * @param {Object} data - Verification data
   */
  addPendingVerification(code, data) {
    this.pendingVerifications.set(code, {
      ...data,
      createdAt: new Date()
    });

    this.logger.debug(`Added pending verification: ${code}`);
  }

  /**
   * Get and optionally remove a pending verification
   * @param {string} code - Verification code
   * @param {boolean} remove - Whether to remove after getting
   * @returns {Object|null}
   */
  getPendingVerification(code, remove = false) {
    const verification = this.pendingVerifications.get(code) || null;

    if (verification && remove) {
      this.pendingVerifications.delete(code);
      this.logger.debug(`Removed pending verification: ${code}`);
    }

    return verification;
  }

  /**
   * Remove a pending verification
   * @param {string} code - Verification code
   * @returns {boolean} Whether verification was found and removed
   */
  removePendingVerification(code) {
    const existed = this.pendingVerifications.delete(code);
    if (existed) {
      this.logger.debug(`Removed pending verification: ${code}`);
    }
    return existed;
  }

  /**
   * Clean up expired verifications
   * @param {number} maxAgeMs - Maximum age in milliseconds
   */
  cleanupExpired(maxAgeMs = 300000) { // 5 minutes default
    const now = new Date();
    let cleanedCount = 0;

    for (const [code, data] of this.pendingVerifications) {
      if (now - data.createdAt > maxAgeMs) {
        this.pendingVerifications.delete(code);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} expired verifications`);
    }
  }

  /**
   * Get pending verification count
   * @returns {number}
   */
  getPendingCount() {
    return this.pendingVerifications.size;
  }
}

// Register core services
container.register('verificationService', () => new VerificationService(), { singleton: true });

module.exports = {
  ServiceContainer,
  container,
  VerificationService
};
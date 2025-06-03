import { Logger } from '../services/index.js';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Default retry configuration for game completion announcements
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ENOTFOUND',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'RATE_LIMITED',
    'INTERNAL_SERVER_ERROR',
    'BAD_GATEWAY',
    'SERVICE_UNAVAILABLE',
    'GATEWAY_TIMEOUT'
  ]
};

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringPeriodMs: number;
  halfOpenMaxCalls: number;
}

/**
 * Default circuit breaker configuration for Discord API calls
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60000, // 1 minute
  monitoringPeriodMs: 300000, // 5 minutes
  halfOpenMaxCalls: 3
};

/**
 * Circuit breaker implementation for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.name = name;
    this.config = config;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, context?: Record<string, any>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.config.recoveryTimeoutMs) {
        const error = new Error(`Circuit breaker ${this.name} is OPEN`);
        Logger.warn(`Circuit breaker ${this.name} rejected call`, { 
          state: this.state, 
          failureCount: this.failureCount,
          ...context 
        });
        throw error;
      } else {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCalls = 0;
        Logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`, { ...context });
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      const error = new Error(`Circuit breaker ${this.name} is HALF_OPEN and max calls exceeded`);
      Logger.warn(`Circuit breaker ${this.name} rejected call in HALF_OPEN state`, { 
        halfOpenCalls: this.halfOpenCalls,
        ...context 
      });
      throw error;
    }

    try {
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.halfOpenCalls++;
      }

      const result = await fn();

      // Success - reset failure count and close circuit if half-open
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        Logger.info(`Circuit breaker ${this.name} transitioning to CLOSED after successful call`, { ...context });
      }

      return result;

    } catch (error) {
      this.recordFailure(error, context);
      throw error;
    }
  }

  /**
   * Record a failure and potentially open the circuit
   */
  private recordFailure(error: any, context?: Record<string, any>): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      Logger.error(`Circuit breaker ${this.name} transitioning to OPEN`, {
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: error instanceof Error ? error.message : String(error),
        ...context
      });
    } else {
      Logger.warn(`Circuit breaker ${this.name} recorded failure`, {
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: error instanceof Error ? error.message : String(error),
        ...context
      });
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): { state: CircuitBreakerState; failureCount: number; lastFailureTime: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenCalls = 0;
    Logger.info(`Circuit breaker ${this.name} manually reset to CLOSED`);
  }
}

/**
 * Retry utility with exponential backoff
 */
export class RetryUtility {
  /**
   * Execute a function with retry logic
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    context?: Record<string, any>
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 1) {
          Logger.info(`Retry succeeded on attempt ${attempt}`, { 
            attempt, 
            maxAttempts: config.maxAttempts,
            ...context 
          });
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        const isRetryable = this.isRetryableError(error, config.retryableErrors);
        const isLastAttempt = attempt === config.maxAttempts;
        
        Logger.warn(`Attempt ${attempt} failed`, {
          attempt,
          maxAttempts: config.maxAttempts,
          isRetryable,
          isLastAttempt,
          error: error instanceof Error ? error.message : String(error),
          ...context
        });
        
        if (!isRetryable || isLastAttempt) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        
        Logger.info(`Retrying in ${delay}ms`, { 
          attempt: attempt + 1, 
          delay,
          ...context 
        });
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: any, retryableErrors: string[]): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || String(error);
    const errorCode = error.code || error.status || '';
    
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) || 
      errorCode.toString().includes(retryableError)
    );
  }

  /**
   * Sleep utility
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Performance metrics for monitoring
 */
export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  retryCount?: number;
  circuitBreakerState?: CircuitBreakerState;
  context?: Record<string, any>;
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private static metrics: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS = 1000; // Keep last 1000 metrics

  /**
   * Start tracking an operation
   */
  static startOperation(operationName: string, context?: Record<string, any>): PerformanceMetrics {
    const metric: PerformanceMetrics = {
      operationName,
      startTime: Date.now(),
      success: false,
      context
    };
    
    return metric;
  }

  /**
   * Complete tracking an operation
   */
  static completeOperation(
    metric: PerformanceMetrics, 
    success: boolean, 
    error?: string,
    retryCount?: number,
    circuitBreakerState?: CircuitBreakerState
  ): void {
    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    metric.error = error;
    metric.retryCount = retryCount;
    metric.circuitBreakerState = circuitBreakerState;

    // Add to metrics array
    this.metrics.push(metric);
    
    // Keep only the last MAX_METRICS entries
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Log performance data
    const logData = {
      operation: metric.operationName,
      duration: metric.duration,
      success: metric.success,
      retryCount: metric.retryCount,
      circuitBreakerState: metric.circuitBreakerState,
      ...metric.context
    };

    if (success) {
      Logger.info(`Operation completed successfully`, logData);
    } else {
      Logger.error(`Operation failed`, { ...logData, error: metric.error });
    }
  }

  /**
   * Get performance statistics
   */
  static getStats(operationName?: string): {
    totalOperations: number;
    successRate: number;
    averageDuration: number;
    recentFailures: number;
  } {
    const relevantMetrics = operationName 
      ? this.metrics.filter(m => m.operationName === operationName)
      : this.metrics;

    const totalOperations = relevantMetrics.length;
    const successfulOperations = relevantMetrics.filter(m => m.success).length;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;
    
    const durationsWithValues = relevantMetrics.filter(m => m.duration !== undefined);
    const averageDuration = durationsWithValues.length > 0 
      ? durationsWithValues.reduce((sum, m) => sum + (m.duration || 0), 0) / durationsWithValues.length
      : 0;

    // Recent failures in last 5 minutes
    const fiveMinutesAgo = Date.now() - 300000;
    const recentFailures = relevantMetrics.filter(m => 
      !m.success && m.startTime > fiveMinutesAgo
    ).length;

    return {
      totalOperations,
      successRate,
      averageDuration,
      recentFailures
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  static clearMetrics(): void {
    this.metrics = [];
  }
} 
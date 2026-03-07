/**
 * AI Safety Constraints Toolkit
 *
 * A comprehensive library for AI safety including:
 * - Prompt injection detection
 * - Input/output filtering
 * - Policy enforcement
 * - Multi-provider LLM adapters
 */

// Core types
export * from './types';

// Core engine
export { SafetyEngine, type SafetyEngineDependencies } from './core/SafetyEngine';
export { SafetyContextBuilder, createSafetyContext, createContextFromHeaders } from './core/SafetyContext';

// Defense modules
export {
  InjectionDetector,
  type InjectionDetectionOptions,
  getAllPatterns,
  getPatternsByCategory,
  getPatternsBySeverity,
  jailbreakPatterns,
  instructionOverridePatterns,
  contextManipulationPatterns,
  encodingPatterns,
  socialEngineeringPatterns,
  indirectInjectionPatterns,
  type InjectionPattern,
} from './defense/injection';

export { InputSanitizer, type SanitizationOptions } from './defense/input';

export {
  OutputFilter,
  type ContentCategory,
  type OutputFilterOptions,
  defaultContentCategories,
} from './defense/output';

// Policy engine
export {
  PolicyEngine,
  type PolicyRule,
  type PolicyCondition,
  type PolicySet,
  permissivePreset,
  moderatePreset,
  strictPreset,
  maximumPreset,
  developmentPreset,
  getPreset,
  getAvailablePresets,
} from './policy';

// Provider adapters
export {
  BaseAdapter,
  type BaseAdapterConfig,
  OpenAIAdapter,
  AnthropicAdapter,
  GoogleAdapter,
  AzureAdapter,
  LocalAdapter,
  AdapterFactory,
  createAdapterFactory,
} from './adapters';

// Protection modules
export { RateLimiter, type RateLimiterOptions } from './protection';

// Monitoring
export { AuditLoggerImpl, MetricsCollectorImpl } from './monitoring';

// Utilities
export * from './utils';

// Version
export const VERSION = '0.1.0';

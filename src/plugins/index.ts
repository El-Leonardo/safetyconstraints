/**
 * Runtime safety plugin system: registry plus built-in plugins.
 */

import type { SafetyPlugin } from '../types/plugin';
import { secretScannerPlugin } from './builtin/secretScanner';
import { piiGuardPlugin } from './builtin/piiGuard';
import { injectionGuardPlugin } from './builtin/injectionGuard';
import { dangerousCommandGuardPlugin } from './builtin/dangerousCommandGuard';

export { PluginRegistry, createPluginRegistry } from './PluginRegistry';
export { secretScannerPlugin } from './builtin/secretScanner';
export { piiGuardPlugin } from './builtin/piiGuard';
export { injectionGuardPlugin } from './builtin/injectionGuard';
export { dangerousCommandGuardPlugin } from './builtin/dangerousCommandGuard';

/**
 * All built-in plugins, ready to register into a {@link PluginRegistry}.
 */
export const builtinPlugins: readonly SafetyPlugin[] = [
  secretScannerPlugin,
  piiGuardPlugin,
  injectionGuardPlugin,
  dangerousCommandGuardPlugin,
];

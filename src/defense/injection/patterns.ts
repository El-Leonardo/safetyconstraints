/**
 * Known prompt injection patterns and signatures
 */

export interface InjectionPattern {
  readonly id: string;
  readonly name: string;
  readonly pattern: RegExp;
  readonly category: 'jailbreak' | 'instruction_override' | 'context_manipulation' | 'encoding' | 'social_engineering';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
}

/**
 * Jailbreak patterns - attempts to bypass safety restrictions
 */
export const jailbreakPatterns: InjectionPattern[] = [
  {
    id: 'dan-1',
    name: 'DAN (Do Anything Now)',
    pattern: /\b(dan|do anything now)\b.*?(ignore previous|ignore all|don't follow|no restrictions)/is,
    category: 'jailbreak',
    severity: 'high',
    description: 'Classic DAN jailbreak attempt',
  },
  {
    id: 'developer-mode',
    name: 'Developer Mode Activation',
    pattern: /\b(enable|activate|turn on)\s+(developer|dev)\s+mode\b/is,
    category: 'jailbreak',
    severity: 'high',
    description: 'Developer mode jailbreak attempt',
  },
  {
    id: 'jailbreak-pretend',
    name: 'Pretend/Fake Mode',
    pattern: /\b(pretend|imagine|suppose|act as if)\b.*?(no rules|no ethics|unfiltered)/is,
    category: 'jailbreak',
    severity: 'medium',
    description: 'Pretend mode jailbreak',
  },
  {
    id: 'hypothetical',
    name: 'Hypothetical Scenario',
    pattern: /\b(hypothetically|in a hypothetical|purely hypothetical)\b.*?(ignore|disregard|forget)/is,
    category: 'jailbreak',
    severity: 'low',
    description: 'Hypothetical scenario attempt',
  },
  {
    id: 'simulator',
    name: 'Simulator Mode',
    pattern: /\b(simulator|simulation|simulated)\s+(mode|environment|world)\b/is,
    category: 'jailbreak',
    severity: 'medium',
    description: 'Simulator mode jailbreak',
  },
  {
    id: 'translation',
    name: 'Translation Attack',
    pattern: /\b(translate|translation)\s+to\s+(base64|hex|binary|morse|rot13)\b/is,
    category: 'jailbreak',
    severity: 'medium',
    description: 'Translation/encoding obfuscation attack',
  },
  {
    id: 'dolphin',
    name: 'Dolphin Attack',
    pattern: /\bdolphin\s*(mode|attack)\b/is,
    category: 'jailbreak',
    severity: 'high',
    description: 'Dolphin mode jailbreak',
  },
  {
    id: 'evil-confidant',
    name: 'Evil Confidant',
    pattern: /\b(evil\s*confidant|unethical\s*assistant)\b/is,
    category: 'jailbreak',
    severity: 'high',
    description: 'Evil confidant jailbreak',
  },
  {
    id: 'moralizing',
    name: 'Anti-Moralizing',
    pattern: /\b(don'?t\s+morali[sz]e|no\s+morali[sz]ing|stop\s+morali[sz]ing)\b/is,
    category: 'jailbreak',
    severity: 'medium',
    description: 'Anti-moralizing instruction',
  },
  {
    id: 'research-purposes',
    name: 'Research Purposes Claim',
    pattern: /\b(for\s+educational|for\s+research|academic\s+purposes)\b.*?(ignore|disregard)/is,
    category: 'jailbreak',
    severity: 'low',
    description: 'Claim of educational/research purpose',
  },
];

/**
 * Instruction override patterns - attempts to change system behavior
 */
export const instructionOverridePatterns: InjectionPattern[] = [
  {
    id: 'system-prompt-leak',
    name: 'System Prompt Extraction',
    pattern: /\b(repeat\s+(after\s+me|the\s+above|everything)|output\s+(above|previous|instruction)|print\s+system)/is,
    category: 'instruction_override',
    severity: 'high',
    description: 'Attempt to extract system prompt',
  },
  {
    id: 'new-instructions',
    name: 'New Instructions',
    pattern: /\b(new\s+instructions?|updated\s+instructions?|instead\s+you\s+will)\b/is,
    category: 'instruction_override',
    severity: 'high',
    description: 'Attempt to inject new instructions',
  },
  {
    id: 'forget-previous',
    name: 'Forget Previous',
    pattern: /\b(forget\s+(everything|all|previous|above|prior)|ignore\s+(previous|above|prior))\b/is,
    category: 'instruction_override',
    severity: 'critical',
    description: 'Attempt to make model forget instructions',
  },
  {
    id: 'system-override',
    name: 'System Override',
    pattern: /\b(system\s*:\s*|system\s+message\s*:|\[system\]|\(\s*system\s*\))\b/is,
    category: 'instruction_override',
    severity: 'critical',
    description: 'System role override attempt',
  },
  {
    id: 'role-play',
    name: 'Role Play Override',
    pattern: /\b(you\s+are\s+now|from\s+now\s+on\s+you\s+are|your\s+new\s+role)\b/is,
    category: 'instruction_override',
    severity: 'medium',
    description: 'Role play instruction override',
  },
];

/**
 * Context manipulation patterns
 */
export const contextManipulationPatterns: InjectionPattern[] = [
  {
    id: 'delimiter-attack',
    name: 'Delimiter Injection',
    pattern: /(```|"""|<\/|\|[a-z]+\|).*?(system|assistant|user|instruction)/is,
    category: 'context_manipulation',
    severity: 'high',
    description: 'Delimiter-based context manipulation',
  },
  {
    id: 'markdown-injection',
    name: 'Markdown Injection',
    pattern: /```.*?yaml\s*\n\s*system.*?```/is,
    category: 'context_manipulation',
    severity: 'high',
    description: 'Markdown code block injection',
  },
  {
    id: 'xml-injection',
    name: 'XML Tag Injection',
    pattern: /<(system|assistant|user|instructions?)\s*>/is,
    category: 'context_manipulation',
    severity: 'high',
    description: 'XML tag injection',
  },
  {
    id: 'json-injection',
    name: 'JSON Context Injection',
    pattern: /\{\s*["']role["']\s*:\s*["']system["']/is,
    category: 'context_manipulation',
    severity: 'high',
    description: 'JSON-based role injection',
  },
  {
    id: 'fake-completion',
    name: 'Fake Completion',
    pattern: /\b(assistant\s*:|ai\s*:|bot\s*:)\s*\n+.*?(i\s+understand|sure|absolutely)/is,
    category: 'context_manipulation',
    severity: 'medium',
    description: 'Fake assistant completion injection',
  },
];

/**
 * Encoding/obfuscation patterns
 */
  export const encodingPatterns: InjectionPattern[] = [
  {
    id: 'base64-suspicious',
    name: 'Suspicious Base64',
    pattern: /\b[a-zA-Z0-9+\/]{40,}={0,2}\b/,
    category: 'encoding',
    severity: 'low',
    description: 'Potential base64 encoded content',
  },
  {
    id: 'unicode-escape',
    name: 'Unicode Escape',
    pattern: /\\u[0-9a-fA-F]{4}/,
    category: 'encoding',
    severity: 'low',
    description: 'Unicode escape sequences',
  },
  {
    id: 'zero-width',
    name: 'Zero-Width Characters',
    pattern: /[\u200B-\u200D\uFEFF\u2060-\u206F]/,
    category: 'encoding',
    severity: 'medium',
    description: 'Zero-width character obfuscation',
  },
  {
    id: 'homoglyph',
    name: 'Homoglyph Attack',
    pattern: /[а-яА-ЯᎪ-Ꮩ]/u,
    category: 'encoding',
    severity: 'low',
    description: 'Cyrillic/homoglyph characters detected',
  },
  {
    id: 'url-encoding',
    name: 'URL Encoding',
    pattern: /%[0-9a-fA-F]{2}/,
    category: 'encoding',
    severity: 'low',
    description: 'URL-encoded content',
  },
];

/**
 * Social engineering patterns
 */
export const socialEngineeringPatterns: InjectionPattern[] = [
  {
    id: 'authority-claim',
    name: 'Authority Claim',
    pattern: /\b(i\s+am\s+(your|the)\s+(developer|creator|admin|administrator|owner))\b/is,
    category: 'social_engineering',
    severity: 'medium',
    description: 'False authority claim',
  },
  {
    id: 'emergency',
    name: 'Emergency/Urgent',
    pattern: /\b(emergency|urgent|critical|life.?threatening)\b.*?(ignore|bypass|override)/is,
    category: 'social_engineering',
    severity: 'medium',
    description: 'Emergency-based social engineering',
  },
  {
    id: 'reverse-psychology',
    name: 'Reverse Psychology',
    pattern: /\b(don'?t\s+tell\s+me|i\s+don'?t\s+want\s+to\s+know)\b/is,
    category: 'social_engineering',
    severity: 'low',
    description: 'Reverse psychology attempt',
  },
  {
    id: 'compliment-manipulation',
    name: 'Compliment Manipulation',
    pattern: /\b(you\s+are\s+(so\s+)?(smart|helpful|intelligent))\b.*?(now|please|could\s+you)/is,
    category: 'social_engineering',
    severity: 'low',
    description: 'Compliment-based manipulation',
  },
];

/**
 * Indirect injection patterns - content that might contain injected instructions
 */
export const indirectInjectionPatterns: InjectionPattern[] = [
  {
    id: 'embedded-instruction',
    name: 'Embedded Instruction',
    pattern: /\b(important:\s*|note:\s*|remember:\s*|p\.s\.\s*|by\s+the\s+way)\s*(ignore|forget|disregard)/is,
    category: 'context_manipulation',
    severity: 'medium',
    description: 'Embedded instruction in content',
  },
  {
    id: 'summarize-inject',
    name: 'Summarize Injection',
    pattern: /\b(summarize|summarise|explain|describe)\b.*?(but\s+first|after\s+that|then)/is,
    category: 'context_manipulation',
    severity: 'low',
    description: 'Instruction hidden in summarization request',
  },
];

/**
 * Get all patterns combined
 */
export function getAllPatterns(): InjectionPattern[] {
  return [
    ...jailbreakPatterns,
    ...instructionOverridePatterns,
    ...contextManipulationPatterns,
    ...encodingPatterns,
    ...socialEngineeringPatterns,
    ...indirectInjectionPatterns,
  ];
}

/**
 * Get patterns by category
 */
export function getPatternsByCategory(
  category: InjectionPattern['category'],
): InjectionPattern[] {
  return getAllPatterns().filter((p) => p.category === category);
}

/**
 * Get patterns by minimum severity
 */
export function getPatternsBySeverity(minSeverity: InjectionPattern['severity']): InjectionPattern[] {
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return getAllPatterns().filter((p) => {
    const patternIndex = severityOrder.indexOf(p.severity);
    return patternIndex >= minIndex;
  });
}

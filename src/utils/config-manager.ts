import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface AppConfig {
  BASE_URL: string;
  ALLOWED_DOMAIN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  SESSION_SECRET: string;
  PORT?: string;
  MEET_WINDOW_MS?: string;
  DB_FILE?: string;
  SESSION_DB_FILE?: string;
  NODE_ENV?: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'config', 'app-config.json');
const SETUP_COMPLETE_FLAG = path.join(process.cwd(), 'config', '.setup-complete');

/**
 * Check if the application setup is complete
 */
export function isSetupComplete(): boolean {
  // Check if setup complete flag exists
  if (fs.existsSync(SETUP_COMPLETE_FLAG)) {
    return true;
  }

  // Check if all required env vars are present
  const required = [
    'BASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET',
  ];

  return required.every((key) => {
    const val = process.env[key];
    return val !== undefined && val !== '';
  });
}

/**
 * Load configuration from file or environment
 */
export function loadConfig(): Partial<AppConfig> {
  let fileConfig: Partial<AppConfig> = {};

  // Try to load from config file if it exists
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(content);
    } catch (err) {
      console.error('Failed to parse config file:', err);
    }
  }

  // Merge with environment variables (env takes precedence)
  return {
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([_, v]) => v !== undefined && v !== '')
    ),
  };
}

/**
 * Save configuration to file and mark setup as complete
 */
export function saveConfig(config: AppConfig): void {
  // Ensure config directory exists
  const configDir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Save config file
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

  // Create setup complete flag
  fs.writeFileSync(SETUP_COMPLETE_FLAG, new Date().toISOString(), 'utf-8');

  // Apply to current process.env
  Object.entries(config).forEach(([key, value]) => {
    if (value !== undefined) {
      process.env[key] = value;
    }
  });
}

/**
 * Generate a secure random session secret
 */
export function generateSessionSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate configuration
 */
export function validateConfig(config: Partial<AppConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const required: (keyof AppConfig)[] = [
    'BASE_URL',
    'ALLOWED_DOMAIN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET',
  ];

  for (const key of required) {
    if (!config[key] || config[key]?.trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  // Validate BASE_URL format
  if (config.BASE_URL) {
    try {
      new URL(config.BASE_URL);
    } catch {
      errors.push('BASE_URL must be a valid URL (e.g., http://localhost:3000)');
    }
  }

  // Validate ALLOWED_DOMAIN format
  if (config.ALLOWED_DOMAIN && config.ALLOWED_DOMAIN.includes('@')) {
    errors.push('ALLOWED_DOMAIN should be just the domain (e.g., example.com, not @example.com)');
  }

  // Validate SESSION_SECRET length
  if (config.SESSION_SECRET && config.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters long');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get current configuration (for display in setup form)
 */
export function getCurrentConfig(): Partial<AppConfig> {
  const config = loadConfig();

  // Provide defaults for optional fields
  return {
    PORT: config.PORT || '3000',
    BASE_URL: config.BASE_URL || '',
    ALLOWED_DOMAIN: config.ALLOWED_DOMAIN || '',
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_CALLBACK_URL: config.GOOGLE_CALLBACK_URL || '',
    SESSION_SECRET: config.SESSION_SECRET || '',
    MEET_WINDOW_MS: config.MEET_WINDOW_MS || '300000',
    DB_FILE: config.DB_FILE || 'app.sqlite',
    SESSION_DB_FILE: config.SESSION_DB_FILE || 'sessions.sqlite',
    NODE_ENV: config.NODE_ENV || 'production',
  };
}

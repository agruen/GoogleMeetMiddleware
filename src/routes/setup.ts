import { Router, Request, Response } from 'express';
import {
  getCurrentConfig,
  saveConfig,
  validateConfig,
  generateSessionSecret,
  type AppConfig,
} from '../utils/config-manager.js';

const router = Router();

/**
 * GET /setup
 * Show the setup form
 */
router.get('/setup', (req: Request, res: Response) => {
  const config = getCurrentConfig();
  res.render('setup', { config, errors: null, csrfToken: (req as any).csrfToken() });
});

/**
 * GET /setup/help
 * Show setup instructions
 */
router.get('/setup/help', (_req: Request, res: Response) => {
  res.render('setup-help');
});

/**
 * POST /setup/save
 * Save the configuration and complete setup
 */
router.post('/setup/save', (req: Request, res: Response) => {
  const formData = req.body;

  // Build config object
  // Checkboxes send 'on' when checked, nothing when unchecked
  const config: AppConfig = {
    BASE_URL: formData.BASE_URL?.trim() || '',
    ALLOWED_DOMAIN: formData.ALLOWED_DOMAIN?.trim() || '',
    ALLOW_ANY_DOMAIN: formData.ALLOW_ANY_DOMAIN === 'on' ? 'true' : 'false',
    SINGLE_USER_MODE: formData.SINGLE_USER_MODE === 'on' ? 'true' : 'false',
    GOOGLE_CLIENT_ID: formData.GOOGLE_CLIENT_ID?.trim() || '',
    GOOGLE_CLIENT_SECRET: formData.GOOGLE_CLIENT_SECRET?.trim() || '',
    GOOGLE_CALLBACK_URL: formData.GOOGLE_CALLBACK_URL?.trim() || '',
    SESSION_SECRET: formData.SESSION_SECRET?.trim() || generateSessionSecret(),
    PORT: formData.PORT?.trim() || '3000',
    MEET_WINDOW_MS: formData.MEET_WINDOW_MS?.trim() || '300000',
    DB_FILE: formData.DB_FILE?.trim() || 'app.sqlite',
    SESSION_DB_FILE: formData.SESSION_DB_FILE?.trim() || 'sessions.sqlite',
    NODE_ENV: formData.NODE_ENV?.trim() || 'production',
  };

  // Auto-generate callback URL if not provided or invalid
  if (!config.GOOGLE_CALLBACK_URL || config.GOOGLE_CALLBACK_URL === '') {
    try {
      const baseUrl = new URL(config.BASE_URL);
      config.GOOGLE_CALLBACK_URL = `${baseUrl.origin}/oauth2/callback`;
    } catch (err) {
      // Will be caught by validation
    }
  }

  // Validate configuration
  const validation = validateConfig(config);

  if (!validation.valid) {
    // Re-render form with errors
    return res.render('setup', {
      config,
      errors: validation.errors,
      csrfToken: (req as any).csrfToken(),
    });
  }

  try {
    // Save configuration
    saveConfig(config);

    const mode = config.ALLOW_ANY_DOMAIN === 'true'
      ? (config.SINGLE_USER_MODE === 'true' ? 'single-user' : 'any-domain')
      : `domain: ${config.ALLOWED_DOMAIN}`;
    console.log(`[Setup] Configuration saved successfully (${mode})`);

    // Show success page
    const isDocker = process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production';
    res.render('setup-success', {
      baseUrl: config.BASE_URL,
      isDocker,
    });
  } catch (err) {
    console.error('[Setup] Failed to save configuration:', err);
    res.render('setup', {
      config,
      errors: ['Failed to save configuration. Please check file permissions.'],
      csrfToken: (req as any).csrfToken(),
    });
  }
});

export default router;

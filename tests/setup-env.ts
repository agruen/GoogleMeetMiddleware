import os from 'node:os';
import path from 'node:path';

// Runs before each test file's modules load (src/utils/db.ts opens the
// database at import time, so DB_FILE must be set here, not in the tests).
process.env.DB_FILE = path.join(os.tmpdir(), `gmm-test-${process.pid}.sqlite`);
process.env.SESSION_SECRET = 'test-secret-1234567890';
process.env.BASE_URL = 'http://localhost:3000';

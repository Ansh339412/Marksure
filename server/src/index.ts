import express from 'express';
import cors from 'cors';
import { env, isSupabaseConfigured } from './config/env.js';
import {
  createRateLimiter,
  enforceJsonContentType,
  globalErrorHandler,
  securityHeaders,
} from './middleware/security.js';
import { authRouter } from './routes/authRoutes.js';
import { adminRouter } from './routes/admin.js';
import { studentRouter } from './routes/student.js';
import { verifyRouter } from './routes/verify.js';
import { correctionsRouter } from './routes/corrections.js';
import { auditRouter } from './routes/audit.js';
import { ensureDemoDataSeeded } from './scripts/seedDemoData.js';

export const app = express();

// 1. Defensive HTTP Security Headers
app.use(securityHeaders);

// 2. Strict CORS Configuration (supports local dev, configured CORS_ORIGIN, and Vercel preview/prod domains)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowedList = [
        env.corsOrigin,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ];
      if (
        env.corsOrigin === '*' ||
        allowedList.includes(origin) ||
        origin.endsWith('.vercel.app')
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not permitted by CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// 3. Enforce application/json on body requests (HTTP 415) & limit payload size (HTTP 413)
app.use(enforceJsonContentType);
app.use(express.json({ limit: '512kb' }));

// 4. General API Rate Limiter (HTTP 429)
app.use(
  '/api',
  createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 180,
    keyPrefix: 'api_global',
  })
);

// 5. Public Health & Cryptographic Public Key Registry Endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'MarkSure Academic Examination & Cryptographic Verification Platform',
    institution_id: env.institutionId,
    institution_public_key: env.institutionPublicKeyHex,
    algorithms: {
      hash: 'SHA-256 (Domain-Separated Merkle Tree)',
      signature: 'Ed25519 (RFC 8032)',
    },
    database_connected: isSupabaseConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// 6. Application Routers
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/student', studentRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/corrections', correctionsRouter);
app.use('/api/audit', auditRouter);

// 7. Unknown API Route Fallback (HTTP 404)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    code: 'ENDPOINT_NOT_FOUND',
    status: 404,
  });
});

// 8. Centralized Error Handler (HTTP 400, 413, 415, 422, 429, 500, 503)
app.use(globalErrorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.port, async () => {
    console.log(
      `[MarkSure Server] Listening on http://localhost:${env.port} (Database configured: ${isSupabaseConfigured()})`
    );
    if (isSupabaseConfigured()) {
      try {
        const res = await ensureDemoDataSeeded();
        console.log(`[MarkSure Registry] ${res.message}`);
      } catch (err) {
        console.warn('[MarkSure Registry] Startup initialization warning:', err);
      }
    }
  });
}

import { betterAuth } from 'better-auth';
import type Database from 'better-sqlite3';

import type { D1Database } from './cloudflare';
import { passwordResetMail, sendMail } from './mailer';
import { hashPassword, verifyPassword } from './password';

export interface AuthOptions {
  /** A local SQLite file, or the D1 database on Workers. */
  readonly database: Database.Database | D1Database;
  /** Public URL of the app. */
  readonly appUrl: string;
  /**
   * Keep sign-in rate limits in the database. Needed on Workers, where
   * memory is not shared between copies of the Worker.
   */
  readonly rateLimitInDatabase?: boolean;
  /**
   * Check the tables against Better Auth's schema on start-up. Off on
   * Workers: the check runs in the background of whichever request starts
   * the Worker, Cloudflare cancels it when that request ends, and every
   * sign-in after it would wait on it forever.
   */
  readonly validateSchema?: boolean;
}

export function createAuth({ database, appUrl, rateLimitInDatabase = false, validateSchema = true }: AuthOptions) {
  return betterAuth({
    // better-sqlite3 and D1 are both recognised by Better Auth directly.
    database: database as Database.Database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        await sendMail(passwordResetMail(user.email, user.name, url));
      },
    },
    // On by default in production; the limits for sign-in and reset are stricter.
    rateLimit: {
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 5 },
      },
      ...(rateLimitInDatabase ? { storage: 'database' as const } : {}),
    },
    advanced: {
      // Cloudflare puts the visitor's address here; other hosts use X-Forwarded-For.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
      database: { validateSchema },
    },
    trustedOrigins: [appUrl, 'http://localhost:5173', 'http://localhost:3001'],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session'];
export type User = Session['user'];

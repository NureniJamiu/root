import { betterAuth } from 'better-auth';
import { db } from './db';
import { passwordResetMail, sendMail } from './mailer';

const appUrl = process.env.VITE_APP_URL ?? 'http://localhost:5173';

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
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
  },
  trustedOrigins: [appUrl, 'http://localhost:5173', 'http://localhost:3001'],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;

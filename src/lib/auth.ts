import { betterAuth } from 'better-auth';
import { db } from './db';

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    process.env.VITE_APP_URL ?? 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:3001',
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;

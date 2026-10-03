import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';

const db = new Database('./auth.db');

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  // Add social providers here if you set up OAuth credentials in your .env.
  // Example (uncomment and fill in your credentials):
  // socialProviders: {
  //   github: {
  //     clientId: process.env.GITHUB_CLIENT_ID!,
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  //   },
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //   },
  // },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;

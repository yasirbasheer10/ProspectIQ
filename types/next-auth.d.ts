import type { DefaultSession } from "next-auth";

/**
 * NextAuth ships a `Session.user` without an `id`, so every call site used to
 * write `(session.user as any).id`. That cast appeared in four files and opted
 * the whole session object out of type checking. Declaring the real shape once
 * here removes the need for it.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      onboardingComplete?: boolean;
    } & DefaultSession["user"];
    /** Set by the client when it calls `update()` after onboarding finishes. */
    onboardingComplete?: boolean;
  }

  interface User {
    onboardingComplete?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    onboardingComplete?: boolean;
  }
}

import { verifyPassword } from "../oauth-utils.js";
import type {
  AuthenticatedUser,
  FormIdentityProvider,
} from "./identity-provider.js";

interface LocalUser {
  username: string;
  password: string;
}

export class LocalIdentityProvider implements FormIdentityProvider {
  type = "form" as const;
  id = "local";
  name = "Local";

  constructor(private users: LocalUser[]) {}

  async validate(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const user = this.users.find(
      (u) => u.username === username && verifyPassword(password, u.password),
    );
    if (!user) return null;
    return { id: `local:${user.username}`, displayName: user.username };
  }
}

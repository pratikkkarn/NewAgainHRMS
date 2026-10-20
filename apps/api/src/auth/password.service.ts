import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** argon2id with the library's recommended defaults (64 MB, 3 passes). */
@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real check. Used when the email doesn't exist, so an attacker
   * can't tell a wrong email from a wrong password by how long the reply takes.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('not-a-real-password-for-timing');
    await this.verify(await this.dummyHash, password);
  }
}

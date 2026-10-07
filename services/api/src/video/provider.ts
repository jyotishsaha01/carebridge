export type VideoRole = "PATIENT" | "DOCTOR";

export interface VideoSession {
  providerSessionId: string;
}

export interface VideoProvider {
  createSession(input: { appointmentId: string }): Promise<VideoSession>;
  createParticipantToken(input: {
    providerSessionId: string;
    userId: string;
    role: VideoRole;
  }): Promise<{ token: string; expiresAt: string }>;
  endSession(input: { providerSessionId: string }): Promise<void>;
}

/**
 * Deterministic local provider for tests/development only.
 * It never contacts a third party and never creates real meeting credentials.
 */
export class FakeVideoProvider implements VideoProvider {
  async createSession(input: { appointmentId: string }): Promise<VideoSession> {
    return { providerSessionId: `local-${input.appointmentId}` };
  }

  async createParticipantToken(input: {
    providerSessionId: string;
    userId: string;
    role: VideoRole;
  }): Promise<{ token: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return {
      token: `local.${input.providerSessionId}.${input.userId}.${input.role}`,
      expiresAt,
    };
  }

  async endSession(_input: { providerSessionId: string }): Promise<void> {
    return undefined;
  }
}

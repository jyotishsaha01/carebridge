export type SecurityEmailKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export type SecurityEmail = {
  kind: SecurityEmailKind;
  recipient: string;
  token: string;
};

export interface SecurityEmailProvider {
  send(message: SecurityEmail): Promise<{ delivered: boolean; provider: string }>;
}

/** Provider-neutral boundary. A real transactional provider must be configured before production. */
export function createSecurityEmailProvider(): SecurityEmailProvider {
  return {
    async send(message) {
      if (process.env.NODE_ENV === "production") {
        if (process.env.SECURITY_EMAIL_PROVIDER !== "configured") {
          throw new Error("Security email provider is not configured");
        }
        return { delivered: false, provider: "configured-provider-not-wired" };
      }

      return {
        delivered: false,
        provider: message.kind === "EMAIL_VERIFICATION" ? "development-preview" : "development-preview",
      };
    },
  };
}

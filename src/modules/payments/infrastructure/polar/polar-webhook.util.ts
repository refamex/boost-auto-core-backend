/* eslint-disable @typescript-eslint/no-require-imports */
const polarWebhooks = require('@polar-sh/sdk/webhooks.js') as {
  validateEvent: (
    body: string | Buffer,
    headers: Record<string, string>,
    secret: string,
  ) => unknown;
  WebhookVerificationError: new (message: string) => Error;
};

export const validatePolarEvent = polarWebhooks.validateEvent;
export const WebhookVerificationError = polarWebhooks.WebhookVerificationError;

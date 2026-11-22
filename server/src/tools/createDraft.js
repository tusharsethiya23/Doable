// Tool: create_draft — saves an email as a Gmail draft. Nobody else sees it, so it runs without a confirmation step;
// the user reviews and sends it from Gmail.
import { GOOGLE_SCOPES } from '../config/google.js';
import { withGmail, composeRaw } from '../services/gmailService.js';
import { composeEmailSchema } from './emailSchemas.js';

export default {
  name: 'create_draft',
  description:
    "Save an email as a draft in the user's Gmail (not sent). Call this when the user asks to draft or prepare an email, or when they want to review it in Gmail before sending.",
  type: 'write',
  autoApprove: true, // low risk: only visible to the user and easy to delete (SRS FR-5.6)
  integration: 'google',
  scopes: [GOOGLE_SCOPES.gmailCompose, GOOGLE_SCOPES.gmailRead],
  inputSchema: composeEmailSchema,

  async run(input, { user }) {
    return withGmail(user, [GOOGLE_SCOPES.gmailCompose, GOOGLE_SCOPES.gmailRead], async ({ gmail, integration }) => {
      const { raw, threadId } = await composeRaw({ gmail, integration, user, input });
      const { data } = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw, ...(threadId && { threadId }) } },
      });
      return {
        drafted: true,
        draftId: data.id,
        to: input.to,
        subject: input.subject,
        openInGmail: 'https://mail.google.com/mail/#drafts',
      };
    });
  },
};

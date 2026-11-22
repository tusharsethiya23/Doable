// Tool: send_email — sends an email from the user's Gmail (new email or a reply in an existing thread).
// type 'write' → the user must approve it before it runs (approval cards arrive in Phase 5).
import { GOOGLE_SCOPES } from '../config/google.js';
import { withGmail, composeRaw } from '../services/gmailService.js';
import { composeEmailSchema } from './emailSchemas.js';

export default {
  name: 'send_email',
  description:
    "Send an email from the user's Gmail account, or reply to an email (pass replyToMessageId). Call this when the user asks you to send or reply to an email. Use exact email addresses — never guess one; look it up with search_emails or ask the user. The user is shown the email and must approve it before it is sent.",
  type: 'write',
  integration: 'google',
  inputSchema: composeEmailSchema,

  async run(input, { user }) {
    return withGmail(user, [GOOGLE_SCOPES.gmailCompose, GOOGLE_SCOPES.gmailRead], async ({ gmail, integration }) => {
      const { raw, threadId } = await composeRaw({ gmail, integration, user, input });
      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, ...(threadId && { threadId }) },
      });
      return { sent: true, messageId: data.id, threadId: data.threadId, to: input.to };
    });
  },
};

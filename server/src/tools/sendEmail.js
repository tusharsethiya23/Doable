// Tool: send_email — sends an email from the user's Gmail account (new email or a reply in an existing thread).
// type 'write' → the user approves it on a card first; preview() builds what that card shows.
import { GOOGLE_SCOPES } from '../config/google.js';
import { withGmail, composeRaw, getReplyContext } from '../services/gmailService.js';
import { composeEmailSchema } from './emailSchemas.js';

const SCOPES = [GOOGLE_SCOPES.gmailCompose, GOOGLE_SCOPES.gmailRead];

export default {
  name: 'send_email',
  description:
    "Send an email from the user's Gmail account, or reply to an email (pass replyToMessageId). Call this when the user asks you to send or reply to an email. Use exact email addresses — never guess one; look it up with search_emails or ask the user. The user is shown the email and must approve it before it is sent.",
  type: 'write',
  integration: 'google',
  scopes: SCOPES,
  inputSchema: composeEmailSchema,

  async preview(input, { user }) {
    // For replies, show the real subject that will be used
    const subject =
      input.subject ||
      (input.replyToMessageId && (await withGmail(user, SCOPES, ({ gmail }) => getReplyContext(gmail, input.replyToMessageId))).subject);
    return {
      title: input.replyToMessageId ? 'Send reply' : 'Send email',
      fields: [
        { label: 'To', value: input.to.join(', ') },
        input.cc?.length && { label: 'Cc', value: input.cc.join(', ') },
        input.bcc?.length && { label: 'Bcc', value: input.bcc.join(', ') },
        { label: 'Subject', value: subject || '(no subject)' },
        { label: 'Message', value: input.body, long: true },
        user.signature && { label: 'Signature', value: 'Your saved signature is added' },
      ].filter(Boolean),
    };
  },

  async run(input, { user }) {
    return withGmail(user, SCOPES, async ({ gmail, integration }) => {
      const { raw, threadId } = await composeRaw({ gmail, integration, user, input });
      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, ...(threadId && { threadId }) },
      });
      return { sent: true, messageId: data.id, threadId: data.threadId, to: input.to };
    });
  },
};

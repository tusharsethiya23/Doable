// Tool: read_email — returns the full text of one email (headers, body, attachment names).
import { z } from 'zod';
import { GOOGLE_SCOPES } from '../config/google.js';
import { withGmail, getHeader, extractBody } from '../services/gmailService.js';

export default {
  name: 'read_email',
  description:
    'Read the full content of one email by its id. Call this after search_emails when you need more than the snippet, e.g. to summarise an email, answer a question about it, or reply to it.',
  type: 'read',
  integration: 'google',
  inputSchema: z.object({
    messageId: z.string().min(1).describe('The email id returned by search_emails.'),
  }),

  async run({ messageId }, { user }) {
    return withGmail(user, [GOOGLE_SCOPES.gmailRead], async ({ gmail }) => {
      const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const headers = data.payload?.headers;
      const { body, attachments } = extractBody(data.payload);

      return {
        id: data.id,
        threadId: data.threadId,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        cc: getHeader(headers, 'Cc'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        attachments,
        // Labelled so the model knows this text was written by someone else and may contain instructions to ignore
        untrusted_email_body: body,
      };
    });
  },
};

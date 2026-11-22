// Input schema shared by send_email and create_draft (same fields: recipients, subject, body, optional reply).
import { z } from 'zod';

const noNewlines = (v) => !/[\r\n]/.test(v); // stops header injection through the subject line
const emailList = (what) => z.array(z.string().trim().email()).max(20).describe(`${what} email addresses`);

export const composeEmailSchema = z
  .object({
    to: emailList('Recipient').min(1),
    cc: emailList('CC').optional(),
    bcc: emailList('BCC').optional(),
    subject: z
      .string()
      .trim()
      .max(250)
      .refine(noNewlines, 'Subject must be a single line')
      .optional()
      .describe('Subject line. Optional when replying (defaults to "Re: <original subject>").'),
    body: z
      .string()
      .min(1)
      .max(20000)
      .describe("Plain-text email body. Don't add a signature — the user's saved signature is appended automatically."),
    replyToMessageId: z
      .string()
      .optional()
      .describe('Gmail message id (from search_emails/read_email) to reply to; keeps the email in the same thread.'),
  })
  .refine((v) => v.subject || v.replyToMessageId, { message: 'subject is required unless replying', path: ['subject'] });

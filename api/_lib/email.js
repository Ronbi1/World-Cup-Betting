// Approval email helper. Sending is non-fatal — a Resend outage must not
// block account approval.
const { Resend } = require('resend');

let resendClient = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

async function sendApprovalEmail(toEmail, userName) {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY missing — skipping approval email.');
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: 'Your World Cup 2026 account has been approved',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem; background: #1a1a2e; color: #e2e8f0; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin-bottom: 0.5rem;">World Cup 2026 Betting</h1>
          <h2 style="color: #e2e8f0;">Welcome, ${userName}!</h2>
          <p style="color: #94a3b8;">Your registration has been approved. You can now log in and start placing your predictions.</p>
          <a href="${process.env.CLIENT_ORIGIN || ''}/login"
             style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #f59e0b; color: #1a1a2e; font-weight: bold; border-radius: 8px; text-decoration: none;">
            Log In Now
          </a>
          <p style="margin-top: 2rem; color: #64748b; font-size: 0.85rem;">Good luck with your bets.</p>
        </div>
      `,
    });
    console.log(`[email] approval email sent to ${toEmail}`);
  } catch (err) {
    console.error(`[email] failed to send approval email to ${toEmail}:`, err.message);
  }
}

module.exports = { sendApprovalEmail };

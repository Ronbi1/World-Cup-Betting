const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends an account approval email to the user.
 * Called from PATCH /users/:id/status when status becomes APPROVED.
 *
 * Non-fatal: if email fails, the approval still succeeds —
 * the error is logged but not thrown.
 */
async function sendApprovalEmail(toEmail, userName) {
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: '✅ Your World Cup 2026 account has been approved!',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem; background: #1a1a2e; color: #e2e8f0; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin-bottom: 0.5rem;">🏆 World Cup 2026 Betting</h1>
          <h2 style="color: #e2e8f0;">Welcome, ${userName}!</h2>
          <p style="color: #94a3b8;">Your registration has been approved by the admin. You can now log in and start placing your predictions.</p>
          <a href="${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/login"
             style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #f59e0b; color: #1a1a2e; font-weight: bold; border-radius: 8px; text-decoration: none;">
            Log In Now
          </a>
          <p style="margin-top: 2rem; color: #64748b; font-size: 0.85rem;">Good luck with your bets! ⚽</p>
        </div>
      `,
    });
    console.log(`[Email] Approval email sent to ${toEmail}`);
  } catch (err) {
    // Email failure is non-fatal — log and continue
    console.error(`[Email] Failed to send approval email to ${toEmail}:`, err.message);
  }
}

module.exports = { sendApprovalEmail };

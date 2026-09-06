// Minimal transactional-email adapter. Only Resend is wired (one HTTP
// call, no SDK dependency). Nothing here fakes success: if RESEND_API_KEY
// / EMAIL_FROM aren't set, isConfigured() is false and callers fall back to
// logging the link to the server console in development — the same
// "say so instead of pretending" stance as every provider in this app.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!isConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:not-configured] would send "${subject}" to ${to}`);
    }
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!isConfigured() && process.env.NODE_ENV !== "production") {
    // The one place the link is logged — dev only, so a local reset can be
    // completed without an email provider.
    console.info(`[email:dev] Password reset link for ${to}: ${resetUrl}`);
    return;
  }
  await send(
    to,
    "Reset your Outlet AI Studio password",
    `<p>Someone asked to reset the password for this Outlet AI Studio account.</p>
     <p><a href="${resetUrl}">Reset your password</a> — this link expires in one hour and can be used once.</p>
     <p>If you didn't request this, you can ignore this email.</p>`,
  );
}

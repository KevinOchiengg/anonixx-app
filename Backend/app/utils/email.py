"""
email.py — Resend-powered transactional email for Anonixx.
All templates are intentionally minimal and on-brand.
"""
import resend
from app.config import settings


def _client() -> None:
    resend.api_key = settings.RESEND_API_KEY


def send_password_reset_otp(to_email: str, otp: str) -> bool:
    """
    Send a 6-digit OTP for password recovery.
    Returns True on success, False on failure (caller decides how to handle).
    """
    _client()

    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reset your Anonixx password</title>
</head>
<body style="margin:0;padding:0;background:#0b0f18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f18;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#151924;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;max-width:480px;width:100%;">

          <!-- Top accent bar -->
          <tr>
            <td style="height:3px;background:#FF634A;"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#FF634A;letter-spacing:2px;text-transform:uppercase;">
                ANONIXX
              </p>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding:20px 32px 0;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#EAEAF0;line-height:1.3;">
                reset your password
              </h1>
              <p style="margin:12px 0 0;font-size:15px;color:#9A9AA3;line-height:1.6;">
                someone (hopefully you) asked to reset the password on this account.
                use the code below — it expires in <strong style="color:#EAEAF0;">15 minutes</strong>.
              </p>
            </td>
          </tr>

          <!-- OTP block -->
          <tr>
            <td style="padding:32px 32px;">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center"
                      style="background:rgba(255,99,74,0.10);border:1px solid rgba(255,99,74,0.25);
                             border-radius:12px;padding:24px;">
                    <p style="margin:0 0 6px;font-size:12px;color:#9A9AA3;letter-spacing:1px;text-transform:uppercase;">
                      your code
                    </p>
                    <p style="margin:0;font-size:42px;font-weight:800;color:#FF634A;letter-spacing:10px;
                               font-variant-numeric:tabular-nums;">
                      {otp}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Warning -->
          <tr>
            <td style="padding:0 32px 32px;">
              <p style="margin:0;font-size:13px;color:#4a4f62;line-height:1.6;">
                if you didn't ask for this, ignore this email — your password won't change.
                never share this code with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:11px;color:#4a4f62;text-align:center;">
                Anonixx · feel first. see later.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    try:
        resend.Emails.send({
            "from":    settings.FROM_EMAIL,
            "to":      [to_email],
            "subject": "your Anonixx reset code",
            "html":    html,
        })
        return True
    except Exception:
        return False

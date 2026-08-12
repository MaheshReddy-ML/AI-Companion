from __future__ import annotations

from pathlib import Path


OTP_EMAIL_LOGO_PATH = Path(__file__).resolve().parent / "static" / "images" / "logo.png"


def build_otp_verification_email(otp: str) -> tuple[str, str]:
    """Build the presentation-only HTML and plain-text OTP email bodies."""
    html_body = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <title>Your AI Companion verification code</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f7fb; color:#172033; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; margin:0; padding:0; background-color:#f4f7fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px; margin:0 auto;">
            <tr>
              <td align="center" style="padding:0 0 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="width:34px; height:34px; border-radius:10px; background-color:#6d5dfc; overflow:hidden; text-align:center; vertical-align:middle;"><img src="cid:ai-companion-logo" width="34" height="34" alt="AI Companion" style="display:block; width:34px; height:34px; border:0; outline:none; text-decoration:none;"></td>
                    <td style="padding-left:10px; color:#172033; font-size:16px; font-weight:750; letter-spacing:-0.3px;">AI Companion</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #e3e8f2; border-radius:24px; background-color:#ffffff; overflow:hidden; box-shadow:0 12px 32px rgba(30,45,75,0.08);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="height:5px; background-color:#6d5dfc; background-image:linear-gradient(90deg,#7c6cff 0%,#28c8ff 100%); font-size:0; line-height:0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="padding:42px 40px 38px;">
                      <p style="margin:0 0 14px; color:#6d5dfc; font-size:12px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;">Secure sign-in</p>
                      <h1 style="margin:0 0 14px; color:#172033; font-size:30px; font-weight:750; letter-spacing:-0.8px; line-height:1.2;">Your brain requested a login code.</h1>
                      <p style="margin:0 0 28px; color:#526078; font-size:16px; line-height:1.65;">We investigated. It was you.</p>
                      <p style="margin:0 0 12px; color:#172033; font-size:14px; font-weight:700; line-height:1.4;">Your verification code</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px;">
                        <tr>
                          <td align="center" style="border:1px solid #dcdcff; border-radius:16px; background-color:#f7f7ff; padding:21px 12px; box-shadow:inset 0 0 0 1px rgba(124,108,255,0.05);">
                            <span style="color:#3024a8; font-size:32px; font-weight:800; letter-spacing:9px; line-height:1; white-space:nowrap;">{otp}</span>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0; color:#526078; font-size:14px; line-height:1.65;">This little number expires in 10 minutes. After that, it retires and becomes completely useless. &#128737;</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 0;">
                        <tr>
                          <td style="border-top:1px solid #e9edf4; font-size:0; line-height:0;">&nbsp;</td>
                        </tr>
                      </table>
                      <p style="margin:25px 0 6px; color:#172033; font-size:14px; font-weight:700; line-height:1.45;">Didn't request this?</p>
                      <p style="margin:0; color:#6b7890; font-size:13px; line-height:1.65;">No worries. You can safely ignore this email. Someone else may have requested it, and honestly, that's between them and their life choices.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 16px 0; color:#758198; font-size:12px; line-height:1.6;">
                <strong style="color:#4b5870; font-weight:700;">AI Companion</strong><br>
                <em>A little space to talk, think, and be yourself.</em>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    text_body = f"""AI Companion — Secure sign-in

Your brain requested a login code. We investigated. It was you.

Your verification code: {otp}

This little number expires in 10 minutes. After that, it retires and becomes completely useless.

Didn't request this? No worries. You can safely ignore this email. Someone else may have requested it, and honestly, that's between them and their life choices.

AI Companion
A little space to talk, think, and be yourself.
"""
    return html_body, text_body

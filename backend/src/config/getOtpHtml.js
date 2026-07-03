const getOtpHtml = ({ name, otp, verifyUrl }) => `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Verify your email</title>
    </head>
    <body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:32px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 12px;">
                  <h1 style="margin:0;font-size:24px;line-height:1.3;color:#111827;">Verify your email</h1>
                  <p style="margin:16px 0 0;font-size:15px;line-height:1.6;">Hi ${name}, use this one-time password to finish creating your account.</p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 28px;">
                  <div style="display:inline-block;letter-spacing:8px;font-size:34px;font-weight:700;color:#111827;background:#f3f4f6;border-radius:8px;padding:16px 18px;">${otp}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 28px 28px;">
                  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4b5563;">This code expires in 5 minutes. You can also verify with the button below.</p>
                  <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:6px;padding:12px 18px;">Verify email</a>
                  <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">If you did not request this account, you can ignore this email.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

export default getOtpHtml;

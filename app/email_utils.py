from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


logger = logging.getLogger(__name__)


def send_email_html(recipient: str, subject: str, html_body: str) -> bool:
    if not settings.email_configured:
        logger.warning("Email transport is not configured. OTP email for %s was not sent.", recipient)
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.email_from_name} <{settings.email_user}>"
    message["To"] = recipient
    message.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.email_host, settings.email_port, timeout=20) as smtp:
        if settings.email_use_tls:
            smtp.starttls()
        smtp.login(settings.email_user, settings.email_password)
        smtp.sendmail(settings.email_user, recipient, message.as_string())

    return True

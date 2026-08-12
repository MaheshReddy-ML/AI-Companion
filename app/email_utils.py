from __future__ import annotations

import logging
import smtplib
from collections.abc import Mapping
from pathlib import Path
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


logger = logging.getLogger(__name__)


def send_email_html(
    recipient: str,
    subject: str,
    html_body: str,
    plain_text_body: str | None = None,
    inline_images: Mapping[str, Path] | None = None,
) -> bool:
    if not settings.email_configured:
        logger.warning("Email transport is not configured. OTP email for %s was not sent.", recipient)
        return False

    message = MIMEMultipart("related")
    message["Subject"] = subject
    message["From"] = f"{settings.email_from_name} <{settings.email_user}>"
    message["To"] = recipient
    alternatives = MIMEMultipart("alternative")
    alternatives.attach(MIMEText(plain_text_body or "Please view this message in an HTML-capable email client.", "plain"))
    alternatives.attach(MIMEText(html_body, "html"))
    message.attach(alternatives)

    for content_id, image_path in (inline_images or {}).items():
        image = MIMEImage(image_path.read_bytes())
        image.add_header("Content-ID", f"<{content_id}>")
        image.add_header("Content-Disposition", "inline", filename=image_path.name)
        message.attach(image)

    with smtplib.SMTP(settings.email_host, settings.email_port, timeout=20) as smtp:
        if settings.email_use_tls:
            smtp.starttls()
        smtp.login(settings.email_user, settings.email_password)
        smtp.sendmail(settings.email_user, recipient, message.as_string())

    return True

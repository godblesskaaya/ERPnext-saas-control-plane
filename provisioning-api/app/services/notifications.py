from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.logging_config import get_logger


settings = get_settings()
log = get_logger(__name__)


@dataclass
class NotificationMessage:
    to_email: str
    subject: str
    text: str
    html: str | None = None


class NotificationService:
    MAILERSEND_API_URL = "https://api.mailersend.com/v1/email"

    @property
    def enabled(self) -> bool:
        return bool(settings.mailersend_api_key and settings.mail_from_email)

    def send(self, message: NotificationMessage) -> bool:
        if not self.enabled:
            log.info(
                "notifications.skipped",
                reason="mailersend_not_configured",
                to_email=message.to_email,
                subject=message.subject,
            )
            return False

        payload = {
            "from": {
                "email": settings.mail_from_email,
                "name": settings.mail_from_name,
            },
            "to": [{"email": message.to_email}],
            "subject": message.subject,
            "text": message.text,
        }
        if message.html:
            payload["html"] = message.html

        headers = {
            "Authorization": f"Bearer {settings.mailersend_api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=settings.mail_timeout_seconds) as client:
                response = client.post(self.MAILERSEND_API_URL, json=payload, headers=headers)
                response.raise_for_status()
        except Exception as exc:
            log.warning(
                "notifications.send_failed",
                to_email=message.to_email,
                subject=message.subject,
                error=str(exc),
            )
            return False

        log.info("notifications.sent", to_email=message.to_email, subject=message.subject)
        return True

    def send_signup_confirmed(self, email: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Welcome to ERP SaaS",
                text=(
                    "Your account was created successfully.\n\n"
                    "You can now sign in and start onboarding your first ERP tenant."
                ),
            )
        )

    def send_provisioning_complete(self, email: str, domain: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Your ERP instance is ready",
                text=(
                    "Provisioning completed successfully.\n\n"
                    f"ERP URL: https://{domain}\n"
                    "Username: Administrator"
                ),
            )
        )

    def send_provisioning_failed(self, email: str, domain: str, error_summary: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="ERP provisioning failed",
                text=(
                    f"We could not complete provisioning for {domain}.\n\n"
                    f"Error summary: {error_summary}\n\n"
                    f"Please contact support at {settings.mail_support_email}."
                ),
            )
        )

    def send_backup_succeeded(self, email: str, domain: str, file_size_bytes: int) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Backup completed",
                text=(
                    f"Backup completed for {domain}.\n\n"
                    f"Backup size: {file_size_bytes} bytes."
                ),
            )
        )

    def send_payment_failed(self, email: str, domain: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Payment failed",
                text=(
                    f"A payment failed for {domain}.\n\n"
                    "Please retry payment to avoid service disruption."
                ),
            )
        )

    def send_tenant_suspended(self, email: str, domain: str, reason: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Tenant suspended",
                text=(
                    f"Your tenant {domain} has been suspended.\n\n"
                    f"Reason: {reason}\n"
                    f"Support: {settings.mail_support_email}"
                ),
            )
        )

    def send_tenant_deleted(self, email: str, domain: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Tenant deleted",
                text=(
                    f"Tenant {domain} has been deleted.\n\n"
                    "If this was unexpected, contact support immediately."
                ),
            )
        )


notification_service = NotificationService()


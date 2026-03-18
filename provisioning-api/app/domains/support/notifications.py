from __future__ import annotations

from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
import smtplib

import httpx

from app.config import get_settings
from app.logging_config import get_logger


log = get_logger(__name__)


@dataclass
class NotificationMessage:
    to_email: str
    subject: str
    text: str
    html: str | None = None


class NotificationService:
    MAILERSEND_API_URL = "https://api.mailersend.com/v1/email"

    @staticmethod
    def _settings():
        return get_settings()

    @property
    def enabled(self) -> bool:
        settings = self._settings()
        if settings.resolved_mail_provider == "smtp":
            if not settings.smtp_host or not settings.mail_from_email:
                return False
            if settings.smtp_username and not settings.smtp_password:
                return False
            return True
        if settings.resolved_mail_provider == "mailersend":
            return bool(settings.mailersend_api_key and settings.mail_from_email)
        return False

    def _send_via_mailersend(self, message: NotificationMessage) -> bool:
        settings = self._settings()
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

        with httpx.Client(timeout=settings.mail_timeout_seconds) as client:
            response = client.post(self.MAILERSEND_API_URL, json=payload, headers=headers)
            response.raise_for_status()
        return True

    def _send_via_smtp(self, message: NotificationMessage) -> bool:
        settings = self._settings()
        email_message = EmailMessage()
        email_message["From"] = formataddr((settings.mail_from_name, settings.mail_from_email))
        email_message["To"] = message.to_email
        email_message["Subject"] = message.subject
        email_message.set_content(message.text)
        if message.html:
            email_message.add_alternative(message.html, subtype="html")

        timeout = settings.smtp_timeout_seconds or settings.mail_timeout_seconds
        if settings.smtp_use_ssl:
            smtp_client = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=timeout)
        else:
            smtp_client = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout)

        with smtp_client as server:
            if settings.smtp_use_tls and not settings.smtp_use_ssl:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(email_message)
        return True

    def send(self, message: NotificationMessage) -> bool:
        settings = self._settings()
        provider = settings.resolved_mail_provider
        if not self.enabled:
            log.info(
                "notifications.skipped",
                reason=f"{provider}_not_configured",
                to_email=message.to_email,
                subject=message.subject,
            )
            return False

        try:
            if provider == "mailersend":
                self._send_via_mailersend(message)
            elif provider == "smtp":
                self._send_via_smtp(message)
            else:
                log.info(
                    "notifications.skipped",
                    reason=f"unsupported_mail_provider:{provider}",
                    to_email=message.to_email,
                    subject=message.subject,
                )
                return False
        except Exception as exc:
            log.warning(
                "notifications.send_failed",
                to_email=message.to_email,
                subject=message.subject,
                provider=provider,
                error=str(exc),
            )
            return False

        log.info("notifications.sent", to_email=message.to_email, subject=message.subject, provider=provider)
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

    def send_email_verification(self, email: str, verification_token: str, verification_url: str | None = None) -> bool:
        verification_instructions = (
            f"Open this link to verify your email:\n{verification_url}"
            if verification_url
            else f"Use this one-time verification token:\n{verification_token}"
        )
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Verify your ERP SaaS email",
                text=(
                    "Please verify your email before creating a workspace.\n\n"
                    f"{verification_instructions}\n\n"
                    "If you did not create this account, you can safely ignore this email."
                ),
            )
        )

    def send_password_reset_requested(self, email: str, reset_token: str, reset_url: str | None = None) -> bool:
        instructions = (
            f"Open this link to reset your password:\n{reset_url}"
            if reset_url
            else f"Use this one-time token to reset your password:\n{reset_token}"
        )
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Reset your ERP SaaS password",
                text=(
                    "A password reset was requested for your ERP SaaS account.\n\n"
                    f"{instructions}\n\n"
                    "If you did not request this, you can safely ignore this email."
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
        settings = self._settings()
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
        settings = self._settings()
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

    def send_tenant_unsuspended(self, email: str, domain: str) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                subject="Tenant access restored",
                text=(
                    f"Your tenant {domain} has been reactivated.\n\n"
                    "You can now sign in and continue operations."
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

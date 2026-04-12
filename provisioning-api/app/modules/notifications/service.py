from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr
import smtplib
from typing import Protocol

import httpx

from app.config import get_settings
from app.modules.observability.logging import get_logger


log = get_logger(__name__)


@dataclass
class NotificationMessage:
    to_email: str
    subject: str
    text: str
    html: str | None = None
    to_phone: str | None = None


class NotificationChannel(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def enabled(self) -> bool: ...

    def send(self, message: NotificationMessage) -> bool: ...


class EmailChannel:
    MAILERSEND_API_URL = "https://api.mailersend.com/v1/email"

    @property
    def name(self) -> str:
        return "email"

    @property
    def enabled(self) -> bool:
        settings = get_settings()
        if settings.resolved_mail_provider == "smtp":
            if not settings.smtp_host or not settings.mail_from_email:
                return False
            if settings.smtp_username and not settings.smtp_password:
                return False
            return True
        if settings.resolved_mail_provider == "mailersend":
            return bool(settings.mailersend_api_key and settings.mail_from_email)
        return False

    def _send_via_mailersend(self, message: NotificationMessage) -> None:
        settings = get_settings()
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

    def _send_via_smtp(self, message: NotificationMessage) -> None:
        settings = get_settings()
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
            if settings.smtp_username and hasattr(server, "login"):
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(email_message)

    def send(self, message: NotificationMessage) -> bool:
        settings = get_settings()
        provider = settings.resolved_mail_provider
        if not message.to_email or not self.enabled:
            return False
        if provider == "mailersend":
            self._send_via_mailersend(message)
            return True
        if provider == "smtp":
            self._send_via_smtp(message)
            return True
        return False


class AfricasTalkingSmsChannel:
    @property
    def name(self) -> str:
        return "sms"

    @property
    def enabled(self) -> bool:
        settings = get_settings()
        return bool(settings.africastalking_api_key and settings.africastalking_username)

    def send(self, message: NotificationMessage) -> bool:
        settings = get_settings()
        if not self.enabled or not message.to_phone:
            return False

        payload = {
            "username": settings.africastalking_username,
            "to": message.to_phone,
            "message": f"{message.subject}\n\n{message.text}",
        }
        if settings.africastalking_sender_id:
            payload["from"] = settings.africastalking_sender_id

        headers = {
            "apiKey": settings.africastalking_api_key,
            "Accept": "application/json",
        }
        with httpx.Client(timeout=settings.mail_timeout_seconds) as client:
            response = client.post(settings.africastalking_base_url, data=payload, headers=headers)
            response.raise_for_status()
        return True


class NotificationService:
    def __init__(self) -> None:
        self.channels: list[NotificationChannel] = [EmailChannel(), AfricasTalkingSmsChannel()]

    @property
    def enabled(self) -> bool:
        return any(channel.enabled for channel in self.channels if channel.name == "email")

    def send(self, message: NotificationMessage) -> bool:
        email_sent = False
        for channel in self.channels:
            if not channel.enabled:
                if channel.name == "sms":
                    continue
                log.info(
                    "notifications.skipped",
                    reason=f"{channel.name}_not_configured",
                    to_email=message.to_email,
                    subject=message.subject,
                )
                continue
            if channel.name == "sms" and not message.to_phone:
                continue
            try:
                sent = channel.send(message)
            except Exception as exc:
                log.warning(
                    "notifications.send_failed",
                    to_email=message.to_email,
                    to_phone=message.to_phone,
                    subject=message.subject,
                    channel=channel.name,
                    error=str(exc),
                )
                sent = False
            if channel.name == "email":
                email_sent = sent

        if email_sent:
            log.info(
                "notifications.sent",
                to_email=message.to_email,
                to_phone=message.to_phone,
                subject=message.subject,
                channels=[channel.name for channel in self.channels if channel.enabled],
            )
        return email_sent

    def send_signup_confirmed(self, email: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Welcome to ERP SaaS",
                text=(
                    "Your account was created successfully.\n\n"
                    "You can now sign in and start onboarding your first ERP tenant."
                ),
            )
        )

    def send_email_verification(
        self,
        email: str,
        verification_token: str,
        verification_url: str | None = None,
        phone: str | None = None,
    ) -> bool:
        verification_instructions = (
            f"Open this link to verify your email:\n{verification_url}"
            if verification_url
            else f"Use this one-time verification token:\n{verification_token}"
        )
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Verify your ERP SaaS email",
                text=(
                    "Please verify your email before creating a workspace.\n\n"
                    f"{verification_instructions}\n\n"
                    "If you did not create this account, you can safely ignore this email."
                ),
            )
        )

    def send_password_reset_requested(
        self,
        email: str,
        reset_token: str,
        reset_url: str | None = None,
        phone: str | None = None,
    ) -> bool:
        instructions = (
            f"Open this link to reset your password:\n{reset_url}"
            if reset_url
            else f"Use this one-time token to reset your password:\n{reset_token}"
        )
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Reset your ERP SaaS password",
                text=(
                    "A password reset was requested for your ERP SaaS account.\n\n"
                    f"{instructions}\n\n"
                    "If you did not request this, you can safely ignore this email."
                ),
            )
        )

    def send_provisioning_complete(self, email: str, domain: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Your ERP instance is ready",
                text=(
                    "Provisioning completed successfully.\n\n"
                    f"ERP URL: https://{domain}\n"
                    "Username: Administrator"
                ),
            )
        )

    def send_provisioning_failed(self, email: str, domain: str, error_summary: str, phone: str | None = None) -> bool:
        settings = get_settings()
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="ERP provisioning failed",
                text=(
                    f"We could not complete provisioning for {domain}.\n\n"
                    f"Error summary: {error_summary}\n\n"
                    f"Please contact support at {settings.mail_support_email}."
                ),
            )
        )

    def send_backup_succeeded(self, email: str, domain: str, file_size_bytes: int, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Backup completed",
                text=(
                    f"Backup completed for {domain}.\n\n"
                    f"Backup size: {file_size_bytes} bytes."
                ),
            )
        )

    def send_payment_failed(self, email: str, domain: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Payment failed",
                text=(
                    f"A payment failed for {domain}.\n\n"
                    "Please retry payment to avoid service disruption."
                ),
            )
        )

    def send_tenant_suspended(self, email: str, domain: str, reason: str, phone: str | None = None) -> bool:
        settings = get_settings()
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Tenant suspended",
                text=(
                    f"Your tenant {domain} has been suspended.\n\n"
                    f"Reason: {reason}\n"
                    f"Support: {settings.mail_support_email}"
                ),
            )
        )

    def send_tenant_unsuspended(self, email: str, domain: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Tenant access restored",
                text=(
                    f"Your tenant {domain} has been reactivated.\n\n"
                    "You can now sign in and continue operations."
                ),
            )
        )

    def send_tenant_deleted(self, email: str, domain: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Tenant deleted",
                text=(
                    f"Tenant {domain} has been deleted.\n\n"
                    "If this was unexpected, contact support immediately."
                ),
            )
        )

    def send_trial_started(self, email: str, domain: str, trial_ends_at: datetime, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Trial started",
                text=(
                    f"Your trial for {domain} is now active.\n\n"
                    f"Trial end: {trial_ends_at.isoformat()}\n"
                    "We'll notify you before access is affected."
                ),
            )
        )

    def send_trial_expiring(self, email: str, domain: str, trial_ends_at: datetime, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Trial ending soon",
                text=(
                    f"Your trial for {domain} is ending soon.\n\n"
                    f"Trial end: {trial_ends_at.isoformat()}\n"
                    "Add or confirm payment details to avoid interruption."
                ),
            )
        )

    def send_trial_converted(self, email: str, domain: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Trial converted to paid",
                text=(
                    f"Your trial for {domain} has been converted to a paid subscription.\n\n"
                    "Billing is active and your workspace remains available."
                ),
            )
        )

    def send_trial_expired_past_due(self, email: str, domain: str, phone: str | None = None) -> bool:
        return self.send(
            NotificationMessage(
                to_email=email,
                to_phone=phone,
                subject="Trial expired — payment required",
                text=(
                    f"Your trial for {domain} has ended and billing is now past due.\n\n"
                    "Complete payment to restore normal billing status."
                ),
            )
        )


notification_service = NotificationService()

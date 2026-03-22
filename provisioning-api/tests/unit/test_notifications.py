from __future__ import annotations

from app.config import get_settings
from app.modules.notifications.service import NotificationMessage, NotificationService


def test_notification_service_smtp_provider(monkeypatch):
    monkeypatch.setenv("MAIL_PROVIDER", "smtp")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("MAIL_FROM_NAME", "ERP SaaS")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "user")
    monkeypatch.setenv("SMTP_PASSWORD", "pass")
    monkeypatch.setenv("SMTP_USE_TLS", "true")
    monkeypatch.setenv("SMTP_USE_SSL", "false")
    get_settings.cache_clear()

    sent: dict[str, object] = {}

    class DummySMTP:
        def __init__(self, host, port, timeout=None):
            sent["host"] = host
            sent["port"] = port
            sent["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def starttls(self):
            sent["starttls"] = True

        def login(self, username, password):
            sent["username"] = username
            sent["password"] = password

        def send_message(self, message):
            sent["subject"] = message["Subject"]
            sent["to"] = message["To"]

    monkeypatch.setattr("app.modules.notifications.service.smtplib.SMTP", DummySMTP)

    service = NotificationService()
    ok = service.send(
        NotificationMessage(
            to_email="owner@example.com",
            subject="Test SMTP",
            text="hello",
        )
    )
    assert ok is True
    assert sent["host"] == "smtp.example.com"
    assert sent["port"] == 587
    assert sent["starttls"] is True
    assert sent["username"] == "user"
    assert sent["password"] == "pass"
    assert sent["to"] == "owner@example.com"
    get_settings.cache_clear()


def test_notification_service_mailersend_provider(monkeypatch):
    monkeypatch.setenv("MAIL_PROVIDER", "mailersend")
    monkeypatch.setenv("MAILERSEND_API_KEY", "ms-key")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "noreply@example.com")
    get_settings.cache_clear()

    sent: dict[str, object] = {}

    class DummyResponse:
        def raise_for_status(self):
            return None

    class DummyClient:
        def __init__(self, timeout):
            sent["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def post(self, url, json, headers):
            sent["url"] = url
            sent["payload"] = json
            sent["headers"] = headers
            return DummyResponse()

    monkeypatch.setattr("app.modules.notifications.service.httpx.Client", DummyClient)

    service = NotificationService()
    ok = service.send(
        NotificationMessage(
            to_email="owner@example.com",
            subject="Test MailerSend",
            text="hello",
        )
    )
    assert ok is True
    assert sent["headers"]["Authorization"] == "Bearer ms-key"
    assert sent["payload"]["to"][0]["email"] == "owner@example.com"
    get_settings.cache_clear()


def test_notification_service_skips_unknown_provider(monkeypatch):
    monkeypatch.setenv("MAIL_PROVIDER", "unknown")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "noreply@example.com")
    get_settings.cache_clear()

    service = NotificationService()
    ok = service.send(NotificationMessage(to_email="owner@example.com", subject="x", text="x"))
    assert ok is False
    get_settings.cache_clear()


def test_notification_service_sends_sms_when_phone_present(monkeypatch):
    monkeypatch.setenv("MAIL_PROVIDER", "smtp")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("AFRICASTALKING_API_KEY", "at-key")
    monkeypatch.setenv("AFRICASTALKING_USERNAME", "sandbox")
    get_settings.cache_clear()

    sent: dict[str, object] = {"sms_calls": 0}

    class DummySMTP:
        def __init__(self, host, port, timeout=None):
            sent["smtp_host"] = host

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def starttls(self):
            return None

        def send_message(self, message):
            sent["email_to"] = message["To"]

    class DummyResponse:
        def raise_for_status(self):
            return None

    class DummyClient:
        def __init__(self, timeout):
            sent["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def post(self, url, data=None, headers=None, json=None):
            sent["sms_calls"] = int(sent["sms_calls"]) + 1
            sent["sms_url"] = url
            sent["sms_data"] = data
            sent["sms_headers"] = headers
            return DummyResponse()

    monkeypatch.setattr("app.modules.notifications.service.smtplib.SMTP", DummySMTP)
    monkeypatch.setattr("app.modules.notifications.service.httpx.Client", DummyClient)

    service = NotificationService()
    ok = service.send(
        NotificationMessage(
            to_email="owner@example.com",
            to_phone="+255700000000",
            subject="SMS enabled",
            text="hello",
        )
    )
    assert ok is True
    assert sent["email_to"] == "owner@example.com"
    assert sent["sms_calls"] == 1
    assert sent["sms_data"]["to"] == "+255700000000"
    get_settings.cache_clear()


def test_notification_service_skips_sms_without_phone(monkeypatch):
    monkeypatch.setenv("MAIL_PROVIDER", "smtp")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("AFRICASTALKING_API_KEY", "at-key")
    monkeypatch.setenv("AFRICASTALKING_USERNAME", "sandbox")
    get_settings.cache_clear()

    sent: dict[str, object] = {"sms_calls": 0}

    class DummySMTP:
        def __init__(self, host, port, timeout=None):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def starttls(self):
            return None

        def send_message(self, message):
            sent["email_to"] = message["To"]

    class DummyResponse:
        def raise_for_status(self):
            return None

    class DummyClient:
        def __init__(self, timeout):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def post(self, url, data=None, headers=None, json=None):
            sent["sms_calls"] = int(sent["sms_calls"]) + 1
            return DummyResponse()

    monkeypatch.setattr("app.modules.notifications.service.smtplib.SMTP", DummySMTP)
    monkeypatch.setattr("app.modules.notifications.service.httpx.Client", DummyClient)

    service = NotificationService()
    ok = service.send(
        NotificationMessage(
            to_email="owner@example.com",
            subject="No phone",
            text="hello",
        )
    )
    assert ok is True
    assert sent["email_to"] == "owner@example.com"
    assert sent["sms_calls"] == 0
    get_settings.cache_clear()


def test_notification_service_sms_failure_does_not_fail_email(monkeypatch):
    monkeypatch.setenv("MAIL_PROVIDER", "smtp")
    monkeypatch.setenv("MAIL_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("AFRICASTALKING_API_KEY", "at-key")
    monkeypatch.setenv("AFRICASTALKING_USERNAME", "sandbox")
    get_settings.cache_clear()

    sent: dict[str, object] = {}

    class DummySMTP:
        def __init__(self, host, port, timeout=None):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def starttls(self):
            return None

        def send_message(self, message):
            sent["email_to"] = message["To"]

    class DummyClient:
        def __init__(self, timeout):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def post(self, url, data=None, headers=None, json=None):
            raise RuntimeError("sms provider unavailable")

    monkeypatch.setattr("app.modules.notifications.service.smtplib.SMTP", DummySMTP)
    monkeypatch.setattr("app.modules.notifications.service.httpx.Client", DummyClient)

    service = NotificationService()
    ok = service.send(
        NotificationMessage(
            to_email="owner@example.com",
            to_phone="+255700000000",
            subject="Fallback email",
            text="hello",
        )
    )
    assert ok is True
    assert sent["email_to"] == "owner@example.com"
    get_settings.cache_clear()

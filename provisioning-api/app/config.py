from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ERP SaaS Provisioning API"
    environment: str = "development"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///./erp_saas.db"
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_storage_url: str | None = None

    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "refresh_token"

    tenant_domain_suffix: str = "erp.blenkotechnologies.co.tz"
    allowed_plans: str = "starter,business,enterprise"
    saas_ui_origins: str = "http://localhost:3000"

    bench_exec_mode: str = "mock"  # mock | docker-compose | pod
    bench_workdir: str = "/workspace"
    bench_compose_file: str = "/workspace/docker-compose.yml"
    bench_compose_command: str = "docker-compose"
    bench_service_name: str = "backend"
    bench_timeout_seconds: int = 180
    bench_db_root_username: str = "root"
    bench_db_root_password: str = ""

    pods_root: str = "/opt/erp-pods"
    pod_compose_filename: str = "docker-compose.yml"
    pod_project_prefix: str = "erp-pod"
    pod_compose_command: str = "docker compose"
    pod_command_timeout_seconds: int = 180
    pod_health_command: str = "ps backend"
    pod_health_timeout_seconds: int = 180
    pod_health_poll_interval_seconds: float = 5.0
    pod_backend_image: str = "frappe/erpnext-worker:latest"
    pod_db_image: str = "mariadb:10.6"
    pod_redis_image: str = "redis:7-alpine"
    pod_traefik_network: str = "proxy"
    pod_cpu_limit: str = "2.0"
    pod_memory_limit: str = "4g"
    backup_s3_bucket: str = ""
    backup_s3_region: str | None = None
    backup_s3_prefix: str = "backups"
    backup_s3_strict: bool = False

    platform_erp_base_url: str = "https://blenko.erp.blenkotechnologies.co.tz"
    platform_erp_api_key: str = ""
    platform_erp_api_secret: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_starter: str = ""
    stripe_price_business: str = ""
    stripe_price_enterprise: str = ""
    active_payment_provider: str = "stripe"  # stripe | dpo
    dpo_company_token: str = ""
    dpo_service_type: str = ""
    dpo_payment_url: str = "https://secure.3gdirectpay.com/payv2.php"
    dpo_api_url: str = "https://secure.3gdirectpay.com/API/v6/"
    billing_checkout_success_url: str = "http://localhost:3000/onboarding?payment=success"
    billing_checkout_cancel_url: str = "http://localhost:3000/onboarding?payment=cancelled"

    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.2

    mailersend_api_key: str = ""
    mail_from_email: str = "noreply@example.com"
    mail_from_name: str = "ERP SaaS"
    mail_support_email: str = "support@example.com"
    mail_timeout_seconds: float = 10.0

    @property
    def allowed_plan_set(self) -> set[str]:
        return {item.strip() for item in self.allowed_plans.split(",") if item.strip()}

    @property
    def saas_ui_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.saas_ui_origins.split(",") if origin.strip()]

    @property
    def resolved_rate_limit_storage_url(self) -> str:
        return self.rate_limit_storage_url or self.redis_url

    @property
    def use_secure_cookies(self) -> bool:
        return self.environment.lower() not in {"development", "test"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

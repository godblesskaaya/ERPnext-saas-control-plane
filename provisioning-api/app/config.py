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

    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    tenant_domain_suffix: str = "erp.blenkotechnologies.co.tz"
    allowed_plans: str = "starter,business,enterprise"

    bench_exec_mode: str = "mock"  # mock | docker-compose
    bench_workdir: str = "/workspace"
    bench_compose_file: str = "/workspace/docker-compose.yml"
    bench_compose_command: str = "docker-compose"
    bench_service_name: str = "backend"
    bench_timeout_seconds: int = 180
    bench_db_root_username: str = "root"
    bench_db_root_password: str = ""

    platform_erp_base_url: str = "https://blenko.erp.blenkotechnologies.co.tz"
    platform_erp_api_key: str = ""
    platform_erp_api_secret: str = ""

    @property
    def allowed_plan_set(self) -> set[str]:
        return {item.strip() for item in self.allowed_plans.split(",") if item.strip()}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

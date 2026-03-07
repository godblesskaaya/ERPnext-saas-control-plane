from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from app.bench.validators import validate_admin_password, validate_domain, validate_subdomain
from app.config import get_settings
from app.models import Tenant


settings = get_settings()
PROJECT_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")


@dataclass
class PodComposeArtifact:
    project_name: str
    project_slug: str
    project_dir: Path
    compose_file: Path


def _validated_project_name(subdomain: str) -> str:
    prefix = settings.pod_project_prefix.strip().lower()
    if not prefix or not PROJECT_NAME_PATTERN.fullmatch(prefix):
        raise ValueError("Invalid pod project prefix")
    project_name = f"{prefix}-{subdomain}"
    if not PROJECT_NAME_PATTERN.fullmatch(project_name):
        raise ValueError("Invalid generated pod project name")
    return project_name


def _validated_compose_filename() -> str:
    filename = settings.pod_compose_filename.strip()
    if not filename:
        raise ValueError("POD_COMPOSE_FILENAME cannot be empty")
    # Prevent path traversal: filename only, no directory segments.
    candidate = Path(filename)
    if candidate.name != filename or filename in {".", ".."}:
        raise ValueError("POD_COMPOSE_FILENAME must be a plain filename")
    return filename


def _validated_project_dir(subdomain: str) -> Path:
    pods_root = Path(settings.pods_root).expanduser().resolve()
    project_dir = (pods_root / subdomain).resolve()
    if project_dir == pods_root or pods_root not in project_dir.parents:
        raise ValueError("Invalid pod project path")
    return project_dir


def _template_env() -> Environment:
    templates_root = Path(__file__).resolve().parent / "templates"
    return Environment(
        loader=FileSystemLoader(str(templates_root)),
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
        undefined=StrictUndefined,
    )


def build_compose_artifact(tenant: Tenant) -> PodComposeArtifact:
    subdomain = validate_subdomain(tenant.subdomain)
    validate_domain(tenant.domain)
    project_name = _validated_project_name(subdomain)
    project_dir = _validated_project_dir(subdomain)
    compose_file = project_dir / _validated_compose_filename()
    return PodComposeArtifact(
        project_name=project_name,
        project_slug=subdomain,
        project_dir=project_dir,
        compose_file=compose_file,
    )


def render_pod_compose(tenant: Tenant, admin_password: str) -> PodComposeArtifact:
    validated_password = validate_admin_password(admin_password)
    validated_subdomain = validate_subdomain(tenant.subdomain)
    validated_domain = validate_domain(tenant.domain)
    artifact = build_compose_artifact(tenant)
    artifact.project_dir.mkdir(parents=True, exist_ok=True)

    template = _template_env().get_template("docker-compose.j2")
    rendered = template.render(
        tenant_id=tenant.id,
        subdomain=validated_subdomain,
        domain=validated_domain,
        project_name=artifact.project_name,
        admin_password=validated_password,
        backend_image=settings.pod_backend_image,
        db_image=settings.pod_db_image,
        redis_image=settings.pod_redis_image,
        traefik_network=settings.pod_traefik_network,
        cpu_limit=settings.pod_cpu_limit,
        memory_limit=settings.pod_memory_limit,
    )
    artifact.compose_file.write_text(rendered, encoding="utf-8")
    return artifact

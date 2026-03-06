from __future__ import annotations

from datetime import datetime, timedelta

from app.models import BackupManifest, Job, Tenant, User


def _auth_headers(client, email: str) -> dict[str, str]:
    client.post("/auth/signup", json={"email": email, "password": "Secret123!"})
    login = client.post("/auth/login", json={"email": email, "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_tenant_with_backups(db_session, *, owner: User) -> tuple[Tenant, list[BackupManifest]]:
    tenant = Tenant(
        owner_id=owner.id,
        subdomain="backup-tenant",
        domain="backup-tenant.erp.blenkotechnologies.co.tz",
        site_name="backup-tenant.erp.blenkotechnologies.co.tz",
        company_name="Backup Co",
        plan="business",
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    older_job = Job(tenant_id=tenant.id, type="backup", status="succeeded")
    newer_job = Job(tenant_id=tenant.id, type="backup", status="succeeded")
    db_session.add_all([older_job, newer_job])
    db_session.commit()
    db_session.refresh(older_job)
    db_session.refresh(newer_job)

    older = BackupManifest(
        tenant_id=tenant.id,
        job_id=older_job.id,
        file_path="/tmp/old.sql.gz",
        file_size_bytes=100,
        created_at=datetime.utcnow() - timedelta(days=2),
        expires_at=datetime.utcnow() + timedelta(days=28),
        s3_key="tenant/old.sql.gz",
    )
    newer = BackupManifest(
        tenant_id=tenant.id,
        job_id=newer_job.id,
        file_path="/tmp/new.sql.gz",
        file_size_bytes=200,
        created_at=datetime.utcnow() - timedelta(hours=1),
        expires_at=datetime.utcnow() + timedelta(days=29),
        s3_key="tenant/new.sql.gz",
    )
    db_session.add_all([older, newer])
    db_session.commit()
    db_session.refresh(older)
    db_session.refresh(newer)
    return tenant, [newer, older]


def test_list_backups_owner_gets_newest_first(client, db_session):
    headers = _auth_headers(client, "owner-backups@example.com")
    owner = db_session.query(User).filter(User.email == "owner-backups@example.com").one()

    tenant, expected_order = _create_tenant_with_backups(db_session, owner=owner)

    response = client.get(f"/tenants/{tenant.id}/backups", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert [entry["id"] for entry in payload] == [item.id for item in expected_order]
    assert payload[0]["file_path"] == "/tmp/new.sql.gz"
    assert payload[0]["s3_key"] == "tenant/new.sql.gz"


def test_list_backups_forbidden_for_non_owner_non_admin(client, db_session):
    owner_headers = _auth_headers(client, "owner2@example.com")
    owner = db_session.query(User).filter(User.email == "owner2@example.com").one()
    tenant, _ = _create_tenant_with_backups(db_session, owner=owner)

    outsider_headers = _auth_headers(client, "outsider@example.com")

    response = client.get(f"/tenants/{tenant.id}/backups", headers=outsider_headers)

    assert owner_headers["Authorization"] != outsider_headers["Authorization"]
    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_list_backups_admin_can_access_any_tenant(client, db_session):
    _auth_headers(client, "owner3@example.com")
    owner = db_session.query(User).filter(User.email == "owner3@example.com").one()
    tenant, expected_order = _create_tenant_with_backups(db_session, owner=owner)

    admin_headers = _auth_headers(client, "admin-backups@example.com")
    admin = db_session.query(User).filter(User.email == "admin-backups@example.com").one()
    admin.role = "admin"
    db_session.add(admin)
    db_session.commit()

    response = client.get(f"/tenants/{tenant.id}/backups", headers=admin_headers)

    assert response.status_code == 200
    payload = response.json()
    assert [entry["id"] for entry in payload] == [item.id for item in expected_order]


def test_list_backups_requires_auth(client):
    response = client.get("/tenants/nonexistent/backups")

    assert response.status_code == 401

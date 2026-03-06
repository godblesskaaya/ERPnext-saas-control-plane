from __future__ import annotations

from unittest.mock import patch


class DummyRQJob:
    id = "rq-1"


def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


def _auth_headers(client):
    client.post("/auth/signup", json={"email": "owner@example.com", "password": "Secret123!"})
    login = client.post("/auth/login", json={"email": "owner@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@patch("app.services.tenant_service.get_queue")
def test_create_and_list_tenant(mock_get_queue, client):
    mock_get_queue.return_value.enqueue = fake_enqueue

    headers = _auth_headers(client)
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "acme", "company_name": "Acme Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    payload = create.json()
    assert payload["tenant"]["domain"] == "acme.erp.blenkotechnologies.co.tz"
    assert payload["job"]["status"] == "queued"

    listed = client.get("/tenants", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    tenant_id = payload["tenant"]["id"]
    reset = client.post(
        f"/tenants/{tenant_id}/reset-admin-password",
        headers=headers,
        json={"new_password": "NewStrongPass123!"},
    )
    assert reset.status_code == 200
    reset_payload = reset.json()
    assert reset_payload["administrator_user"] == "Administrator"
    assert reset_payload["admin_password"] == "NewStrongPass123!"

    auto_reset = client.post(
        f"/tenants/{tenant_id}/reset-admin-password",
        headers=headers,
        json={},
    )
    assert auto_reset.status_code == 200
    assert len(auto_reset.json()["admin_password"]) >= 8


def test_tenants_requires_auth(client):
    response = client.get("/tenants")
    assert response.status_code == 401

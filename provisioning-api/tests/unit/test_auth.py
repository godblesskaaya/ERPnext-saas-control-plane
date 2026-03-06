from __future__ import annotations


def test_signup_and_login(client):
    signup = client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "Secret123!"},
    )
    assert signup.status_code == 201

    login = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "Secret123!"},
    )
    assert login.status_code == 200
    data = login.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"


def test_login_invalid_password(client):
    client.post("/auth/signup", json={"email": "user@example.com", "password": "Secret123!"})
    login = client.post("/auth/login", json={"email": "user@example.com", "password": "Wrong1234"})
    assert login.status_code == 401

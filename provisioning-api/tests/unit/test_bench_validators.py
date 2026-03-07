from __future__ import annotations

import pytest

from app.bench.validators import (
    ValidationError,
    domain_from_subdomain,
    validate_admin_password,
    validate_app_name,
    validate_plan,
    validate_subdomain,
)



def test_domain_from_subdomain():
    assert domain_from_subdomain("tenant-1") == "tenant-1.erp.blenkotechnologies.co.tz"



def test_validate_plan_accepts_allowlisted():
    assert validate_plan("starter") == "starter"



def test_validate_plan_rejects_unknown():
    with pytest.raises(ValidationError):
        validate_plan("gold")



def test_validate_app_name_allowlist():
    assert validate_app_name("erpnext") == "erpnext"
    assert validate_app_name("helpdesk") == "helpdesk"
    assert validate_app_name("posawesome") == "posawesome"
    with pytest.raises(ValidationError):
        validate_app_name("customapp")



def test_validate_admin_password_rules():
    assert validate_admin_password("StrongPass123!") == "StrongPass123!"
    with pytest.raises(ValidationError):
        validate_admin_password("short")
    with pytest.raises(ValidationError):
        validate_admin_password("bad password")



def test_validate_subdomain_rejects_reserved_names():
    with pytest.raises(ValidationError):
        validate_subdomain("admin")

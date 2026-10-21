import json

import pytest

from app import export_openapi


def test_schema_contains_all_documented_endpoints() -> None:
    schema = export_openapi.build_schema()
    paths = schema["paths"]
    assert isinstance(paths, dict)
    assert set(paths) >= {
        "/api/v1/healthz",
        "/api/v1/readyz",
        "/api/v1/public/leads",
        "/api/v1/admin/auth/login",
        "/api/v1/admin/auth/logout",
        "/api/v1/admin/auth/me",
        "/api/v1/admin/auth/password",
        "/api/v1/admin/auth/sessions/revoke-all",
        "/api/v1/admin/leads",
        "/api/v1/admin/leads/export.csv",
        "/api/v1/admin/leads/{lead_id}",
        "/api/v1/admin/leads/{lead_id}/notes",
    }


def test_errors_documented_as_problem_json() -> None:
    schema = export_openapi.build_schema()
    post = schema["paths"]["/api/v1/public/leads"]["post"]  # type: ignore[index]
    for status in ("201", "400", "422", "429"):
        assert status in post["responses"]
    assert "application/problem+json" in post["responses"]["429"]["content"]


def test_main_prints_json(capsysbinary: pytest.CaptureFixture[bytes]) -> None:
    export_openapi.main()
    out = capsysbinary.readouterr().out.decode()
    assert json.loads(out)["info"]["title"] == "Заявочка API"

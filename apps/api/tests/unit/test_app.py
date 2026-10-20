from app.main import create_app


def test_create_app_returns_fastapi_instance() -> None:
    assert create_app().title == "Заявочка API"

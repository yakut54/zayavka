import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import InputModel


class LoginRequest(InputModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class PasswordChange(InputModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(max_length=256)


class AdminMe(BaseModel):
    id: uuid.UUID
    email: str

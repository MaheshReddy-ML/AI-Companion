from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    starting_mood: Literal["calm", "hopeful", "tired", "anxious", "low", "unsure"] | None = Field(default=None, alias="startingMood")

    model_config = ConfigDict(populate_by_name=True)


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    token: str


class AvatarPresetUpdateRequest(BaseModel):
    preset_id: str = Field(alias="presetId")

    model_config = ConfigDict(populate_by_name=True)


class AvatarUploadRequest(BaseModel):
    image_data_url: str = Field(alias="imageDataUrl")

    model_config = ConfigDict(populate_by_name=True)


class SendOtpRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str = Field(alias="newPassword")

    model_config = ConfigDict(populate_by_name=True)

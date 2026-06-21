from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    @field_validator('SUPABASE_URL', mode='before')
    @classmethod
    def clean_supabase_url(cls, v: str) -> str:
        # If the user accidentally included the REST path, strip it
        v = v.rstrip('/')
        if v.endswith('/rest/v1'):
            v = v[:-8]
        return v

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

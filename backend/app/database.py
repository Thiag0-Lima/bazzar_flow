import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_PATH = Path(
    os.environ.get(
        "BAZZAR_DATABASE_PATH",
        str(Path(__file__).resolve().parents[1] / "bazzar_flow.db"),
    )
).expanduser()
if not DATABASE_PATH.is_absolute():
    raise ValueError("BAZZAR_DATABASE_PATH deve ser um caminho absoluto.")

SQLALCHEMY_DATABASE_URL = URL.create(
    "sqlite", database=str(DATABASE_PATH.resolve())
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
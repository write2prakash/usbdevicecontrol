from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.core.config import settings


def create_database_engine(database_url: str):
    url = make_url(database_url)
    connect_args = {}
    if url.drivername.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(database_url, pool_pre_ping=True, connect_args=connect_args)

    try:
        with engine.connect():
            pass
        return engine
    except OperationalError as exc:
        if url.drivername.startswith("mysql") and url.host in {"localhost", "127.0.0.1", None}:
            fallback_url = "sqlite:///./usb_control.db"
            fallback_args = {"check_same_thread": False}
            fallback_engine = create_engine(fallback_url, pool_pre_ping=True, connect_args=fallback_args)
            print(
                f"Warning: could not connect to MySQL at {url.host}:{url.port}. Falling back to SQLite at {fallback_url}."
            )
            return fallback_engine
        raise


engine = create_database_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

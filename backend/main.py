from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from backend.core.config import settings
from backend.core.db import engine, Base
from backend.routers import auth, superadmin, admin, agent, notifications
from backend.websocket.manager import manager

Base.metadata.create_all(bind=engine)

# Add machine_id column to endpoints if the table was created before this field existed
with engine.connect() as _conn:
    try:
        _conn.execute(text("ALTER TABLE endpoints ADD COLUMN machine_id VARCHAR(255)"))
        _conn.commit()
    except Exception:
        pass

app = FastAPI(title="USB Control SaaS", version="0.1.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(superadmin.router, prefix="/superadmin", tags=["superadmin"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.on_event("startup")
def startup_event():
    manager.start()

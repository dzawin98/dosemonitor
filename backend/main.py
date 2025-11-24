from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.database import engine, Base
from sqlalchemy import text
from app.routers import patients, dose_extraction, reporting
from app.routers import auth as auth_router
from app.models import User
from app.auth import hash_password

# Load environment variables
load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

# Lightweight migration to add missing columns for dose_records (SQLite/MySQL)
try:
    with engine.connect() as conn:
        # Detect existing columns (SQLite)
        existing_cols = set()
        try:
            res = conn.execute(text("PRAGMA table_info('dose_records')"))
            existing_cols = {row[1] for row in res.fetchall()}
        except Exception:
            # Fallback: MySQL information_schema
            try:
                res = conn.execute(text("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='dose_records'"))
                existing_cols = {row[0] for row in res.fetchall()}
            except Exception:
                existing_cols = set()

        # Define required columns and DDL
        required = [
            ("patient_sex", "TEXT"),
            ("patient_age_years", "REAL"),
            ("patient_weight_kg", "REAL"),
            ("exam_type", "TEXT"),
            ("contrast_used", "INTEGER"),
            ("sequence_count", "INTEGER"),
            ("ctdivol_average_mgy", "REAL"),
            ("idrl_category", "TEXT"),
            ("idrl_ctdivol_limit_mgy", "REAL"),
            ("idrl_dlp_limit_mgycm", "REAL"),
            ("idrl_status", "TEXT"),
        ]
        for col, typ in required:
            if col not in existing_cols:
                try:
                    # SQLite uses simple types; MySQL compatibility via generic ADD COLUMN
                    conn.execute(text(f"ALTER TABLE dose_records ADD COLUMN {col} {typ}"))
                except Exception:
                    pass
except Exception:
    # Do not block app start if migration fails
    pass

# Ensure at least one admin user exists
try:
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with SessionLocal() as db:
        count = db.query(User).count()
        if count == 0:
            username = os.getenv("ADMIN_USERNAME", "admin")
            password = os.getenv("ADMIN_PASSWORD", "admin")
            ph = hash_password(password)
            u = User(username=username, password_hash=ph, role="admin", is_active=True)
            db.add(u)
            db.commit()
except Exception:
    pass

app = FastAPI(
    title="Radiology Dose Management API",
    description="Backend API for managing CT dose data from Orthanc PACS",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(patients.router, prefix="/api/v1", tags=["patients"])
app.include_router(dose_extraction.router, prefix="/api/v1", tags=["dose-extraction"])
app.include_router(reporting.router, prefix="/api/v1", tags=["reporting"])
app.include_router(auth_router.router, prefix="/api/v1", tags=["auth"])

@app.get("/")
async def root():
    return {"message": "Radiology Dose Management API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "False").lower() == "true"
    )
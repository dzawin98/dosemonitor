from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.database import engine, Base
from sqlalchemy import text
from app.routers import patients, dose_extraction, reporting
from app.routers import idrl as idrl_router
from app.routers import auth as auth_router
from app.models import User
from app.models import IDRLNationalThreshold
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
    with SessionLocal() as db:
        try:
            def upsert(row):
                q = db.query(IDRLNationalThreshold).filter(
                    IDRLNationalThreshold.category_key == row["category_key"],
                    IDRLNationalThreshold.contrast == row["contrast"],
                    IDRLNationalThreshold.age_group == row["age_group"],
                    IDRLNationalThreshold.year == row.get("year", 2024),
                )
                ex = q.first()
                if ex:
                    ex.ctdi_limit_mgy = row.get("ctdi_limit_mgy")
                    ex.dlp_limit_mgycm = row.get("dlp_limit_mgycm")
                    ex.active = True
                else:
                    db.add(IDRLNationalThreshold(**row))
            BABY = "BABY_0_4"
            CHILD = "CHILD_5_14"
            ADULT = "ADULT_15_PLUS"
            data = []
            data += [
                {"category_key": "Chest Low Dose", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 4.3, "dlp_limit_mgycm": 368},
                {"category_key": "CT ABDOMEN", "contrast": True, "age_group": CHILD, "year": 2024, "ctdi_limit_mgy": 6.5, "dlp_limit_mgycm": 760},
                {"category_key": "CT ABDOMEN", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 16.1, "dlp_limit_mgycm": 1398},
                {"category_key": "CT ABDOMEN PLANNING", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 7.4, "dlp_limit_mgycm": 346},
                {"category_key": "CT AbdoPelvis", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 9.5, "dlp_limit_mgycm": 1549},
                {"category_key": "CT Angiography (CTA)", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 17.4, "dlp_limit_mgycm": 3206},
                {"category_key": "CT Cardiac Studies", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 27.2, "dlp_limit_mgycm": 1009},
                {"category_key": "CT Chest", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 10.2, "dlp_limit_mgycm": 1069},
                {"category_key": "CT Head", "contrast": True, "age_group": BABY, "year": 2024, "ctdi_limit_mgy": 48.8, "dlp_limit_mgycm": 914},
                {"category_key": "CT Head", "contrast": True, "age_group": CHILD, "year": 2024, "ctdi_limit_mgy": 51.9, "dlp_limit_mgycm": 2001},
                {"category_key": "CT Head", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 51.8, "dlp_limit_mgycm": 2408},
                {"category_key": "CT Larynx/Nasopharynx", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 6.9, "dlp_limit_mgycm": 558},
                {"category_key": "CT Neck", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 6.2, "dlp_limit_mgycm": 511},
                {"category_key": "CT Urology", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 13.3, "dlp_limit_mgycm": 658},
                {"category_key": "CT Whole Abdomen", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 17.6, "dlp_limit_mgycm": 2443},
                {"category_key": "CTA Head", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 50.0, "dlp_limit_mgycm": 2988},
                {"category_key": "Sinuses Paranasal CT", "contrast": True, "age_group": BABY, "year": 2024, "ctdi_limit_mgy": None, "dlp_limit_mgycm": 595},
                {"category_key": "Sinuses Paranasal CT", "contrast": True, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": None, "dlp_limit_mgycm": 752},
                {"category_key": "Chest Low Dose", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 6.4, "dlp_limit_mgycm": 289},
                {"category_key": "CT ABDOMEN", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 12.0, "dlp_limit_mgycm": 666},
                {"category_key": "CT AbdoPelvis", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 14.4, "dlp_limit_mgycm": 722},
                {"category_key": "CT Angiography (CTA)", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 50.4, "dlp_limit_mgycm": 630},
                {"category_key": "CT Calcium Score", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 5.2, "dlp_limit_mgycm": 92},
                {"category_key": "CT Cardiac Studies", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 24.7, "dlp_limit_mgycm": 792},
                {"category_key": "CT Chest", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 8.8, "dlp_limit_mgycm": 407},
                {"category_key": "CT Extremities", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 14.1, "dlp_limit_mgycm": 539},
                {"category_key": "CT Head", "contrast": False, "age_group": BABY, "year": 2024, "ctdi_limit_mgy": 40.2, "dlp_limit_mgycm": 1079},
                {"category_key": "CT Head", "contrast": False, "age_group": CHILD, "year": 2024, "ctdi_limit_mgy": 45.2, "dlp_limit_mgycm": 1201},
                {"category_key": "CT Head", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 51.8, "dlp_limit_mgycm": 1178},
                {"category_key": "CT HEAD AND NECK PLANNING", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 24.6, "dlp_limit_mgycm": 749},
                {"category_key": "CT HEAD PLANNING", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 50.2, "dlp_limit_mgycm": 1296},
                {"category_key": "CT Lumbar Spine", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 17.0, "dlp_limit_mgycm": 577},
                {"category_key": "CT Mastoids", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 32.3, "dlp_limit_mgycm": 385},
                {"category_key": "CT Pelvis / Hip", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 14.7, "dlp_limit_mgycm": 483},
                {"category_key": "CT Urology", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 12.4, "dlp_limit_mgycm": 658},
                {"category_key": "CT Whole Abdomen", "contrast": False, "age_group": CHILD, "year": 2024, "ctdi_limit_mgy": 6.1, "dlp_limit_mgycm": 311},
                {"category_key": "CT Whole Abdomen", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 15.1, "dlp_limit_mgycm": 745},
                {"category_key": "CTA Head", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 57.3, "dlp_limit_mgycm": 1222},
                {"category_key": "FACIAL BONE 3D CT", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 48.5, "dlp_limit_mgycm": 1272},
                {"category_key": "Sinuses Paranasal CT", "contrast": False, "age_group": BABY, "year": 2024, "ctdi_limit_mgy": 43.5, "dlp_limit_mgycm": 595},
                {"category_key": "Sinuses Paranasal CT", "contrast": False, "age_group": ADULT, "year": 2024, "ctdi_limit_mgy": 47.2, "dlp_limit_mgycm": 752},
            ]
            for r in data:
                upsert(r)
            db.commit()
        except Exception:
            pass
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
app.include_router(idrl_router.router, prefix="/api/v1", tags=["idrl"])

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

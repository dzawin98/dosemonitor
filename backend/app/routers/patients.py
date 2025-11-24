from fastapi import APIRouter, HTTPException, Query, Request, Depends
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.schemas import (
    PatientListResponse,
    StudyInfo,
    ErrorResponse,
    OrthancConfigResponse,
    OrthancConfigUpdateRequest,
    DatabaseConfigResponse,
    DatabaseConfigUpdateRequest,
    DatabaseTestRequest,
    DatabaseTestResponse,
)
from app.orthanc_client import orthanc_client
from app.dicom_mapping import get_mapping_for_modality, pick_tag
from app.database import get_db
from app.routers.auth import _require_admin
from sqlalchemy.engine import url as sa_url
from sqlalchemy import create_engine, text
import os

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/patient-list", response_model=PatientListResponse)
async def get_patient_list(
    limit: int = Query(default=50, ge=1, le=200, description="Maximum number of studies to return"),
    modality: str = Query(default="CT", description="Filter by modality")
):
    """
    Get list of CT studies from Orthanc PACS
    
    - **limit**: Maximum number of studies to return (1-200)
    - **modality**: Filter by modality (default: CT)
    """
    try:
        # Test Orthanc connection first
        if not orthanc_client.test_connection():
            raise HTTPException(
                status_code=503, 
                detail="Cannot connect to Orthanc server. Please check configuration."
            )
        
        # Get studies from Orthanc filtered by modality
        studies_data = orthanc_client.find_ct_studies(limit=limit, modality=modality)

        # Helper to format date YYYYMMDD -> DD/MM/YYYY
        def _fmt_ddmmyyyy(d: Optional[str]) -> Optional[str]:
            try:
                if d and isinstance(d, str) and len(d) == 8 and d.isdigit():
                    return f"{d[6:8]}/{d[4:6]}/{d[0:4]}"
            except Exception:
                pass
            return d or None

        # Convert to StudyInfo objects with enrichment from detailed study info
        studies = []
        for study in studies_data:
            orthanc_id = study.get("orthanc_id")
            main_tags = {}
            patient_tags = {}
            try:
                info = orthanc_client.get_study_info(orthanc_id) if orthanc_id else None
                main_tags = (info or {}).get("MainDicomTags", {})
                patient_tags = (info or {}).get("PatientMainDicomTags", {})
            except Exception:
                pass

            # Extract requested fields using modality-based mapping
            modality_used = study.get("modality", modality)
            mapping = get_mapping_for_modality(modality_used)

            birth_raw = pick_tag(patient_tags, mapping.get("birth_date", []))
            birth_date = _fmt_ddmmyyyy(birth_raw if isinstance(birth_raw, str) else str(birth_raw) if birth_raw is not None else None)

            study_desc = pick_tag(main_tags, mapping.get("exam", []))
            mods = main_tags.get("ModalitiesInStudy")
            if isinstance(mods, list):
                mods_str = "/".join([str(m) for m in mods])
            else:
                mods_str = mods if isinstance(mods, str) else None
            accession = pick_tag(main_tags, mapping.get("accession", []))

            study_info = StudyInfo(
                study_instance_uid=study.get("study_instance_uid", ""),
                patient_id=study.get("patient_id", ""),
                patient_name=study.get("patient_name", ""),
                study_date=_fmt_ddmmyyyy(study.get("study_date")),
                modality=modality_used,
                patient_birth_date=birth_date,
                study_description=study_desc,
                modalities_in_study=mods_str,
                accession_number=accession,
            )
            studies.append(study_info)
        
        return PatientListResponse(
            studies=studies,
            total_count=len(studies)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient list: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/orthanc-status")
async def check_orthanc_status():
    """
    Check Orthanc server connection status
    """
    try:
        is_connected = orthanc_client.test_connection()
        
        if is_connected:
            # Get system info if connected
            system_info = orthanc_client._get_json("system")
            return {
                "status": "connected",
                "orthanc_url": orthanc_client.base_url,
                "system_info": system_info
            }
        else:
            return {
                "status": "disconnected",
                "orthanc_url": orthanc_client.base_url,
                "error": "Cannot connect to Orthanc server"
            }
            
    except Exception as e:
        logger.error(f"Error checking Orthanc status: {str(e)}")
        return {
            "status": "error",
            "orthanc_url": orthanc_client.base_url,
            "error": str(e)
        }

@router.get("/orthanc-config", response_model=OrthancConfigResponse)
async def get_orthanc_config(request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    return OrthancConfigResponse(
        base_url=orthanc_client.base_url,
        username=orthanc_client.username or None,
        auth_enabled=bool(orthanc_client.auth)
    )

@router.put("/orthanc-config", response_model=OrthancConfigResponse)
async def update_orthanc_config(body: OrthancConfigUpdateRequest, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    updated = orthanc_client.update_config(
        base_url=body.base_url,
        username=body.username,
        password=body.password,
    )
    return OrthancConfigResponse(**updated)

@router.get("/db-config", response_model=DatabaseConfigResponse)
async def get_db_config(request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    database_url = os.getenv("DATABASE_URL", "mysql+pymysql://root:@localhost:3306/dosemonitor")
    try:
        parsed = sa_url.make_url(database_url)
        return DatabaseConfigResponse(
            driver=f"{parsed.get_backend_name()}+{parsed.get_driver_name()}",
            host=parsed.host or "localhost",
            port=parsed.port or 3306,
            database=parsed.database or "",
            username=parsed.username or None,
            password_set=bool(parsed.password)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid DATABASE_URL: {str(e)}")

@router.put("/db-config", response_model=DatabaseConfigResponse)
async def update_db_config(body: DatabaseConfigUpdateRequest, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    # Build SQLAlchemy URL
    host = body.host.strip()
    url = f"mysql+pymysql://{body.username}:{body.password}@{host}:{body.port}/{body.database}"
    # Update backend .env file
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    try:
        lines: list[str] = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
        updated = False
        new_line = f"DATABASE_URL={url}"
        for i, line in enumerate(lines):
            if line.startswith("DATABASE_URL="):
                lines[i] = new_line
                updated = True
                break
        if not updated:
            lines.append(new_line)
        with open(env_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update .env: {str(e)}")

    os.environ["DATABASE_URL"] = url
    return await get_db_config(request, db)

@router.post("/db-test", response_model=DatabaseTestResponse)
async def test_db_connection(body: DatabaseTestRequest, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    try:
        host = body.host.strip()
        url = f"mysql+pymysql://{body.username}:{body.password}@{host}:{body.port}/{body.database}"
        eng = create_engine(url)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return DatabaseTestResponse(success=True, message="Koneksi berhasil")
    except Exception as e:
        return DatabaseTestResponse(success=False, message=f"Gagal konek: {str(e)}")
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import logging

from app.schemas import PatientListResponse, StudyInfo, ErrorResponse
from app.orthanc_client import orthanc_client
from app.dicom_mapping import get_mapping_for_modality, pick_tag

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
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging
import time

from app.schemas import (
    DoseExtractionRequest, 
    DoseExtractionResponse, 
    DoseSaveRequest,
    DoseSaveResponse,
    ErrorResponse,
    StudyTagsRequest,
    StudyTagsResponse,
)
from app.database import get_db
from app.models import DoseRecord, ExtractionLog
from app.dose_extractor import dose_extractor
from app.idrl_thresholds import compute_idrl_status

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/extract-dose", response_model=DoseExtractionResponse)
async def extract_dose(
    request: DoseExtractionRequest,
    db: Session = Depends(get_db)
):
    """
    Extract dose information from a CT study
    
    - **study_instance_uid**: The StudyInstanceUID to extract dose from
    """
    start_time = time.time()
    
    try:
        # Log extraction attempt
        extraction_log = ExtractionLog(
            study_instance_uid=request.study_instance_uid,
            method_used="AUTO",
            success=False
        )
        
        # Extract dose information
        dose_data = dose_extractor.extract_dose_from_study(request.study_instance_uid)
        
        # Update extraction log
        processing_time = time.time() - start_time
        extraction_log.processing_time_seconds = processing_time
        extraction_log.success = dose_data["extraction_status"] in ["SUCCESS", "PARTIAL"]
        
        if not extraction_log.success:
            extraction_log.error_message = dose_data.get("extraction_notes", "Unknown error")
        
        # Save extraction log
        db.add(extraction_log)
        db.commit()
        
        # Return response
        return DoseExtractionResponse(**dose_data)
        
    except Exception as e:
        logger.error(f"Error extracting dose for study {request.study_instance_uid}: {str(e)}")
        
        # Log failed extraction
        try:
            processing_time = time.time() - start_time
            extraction_log = ExtractionLog(
                study_instance_uid=request.study_instance_uid,
                method_used="AUTO",
                success=False,
                error_message=str(e),
                processing_time_seconds=processing_time
            )
            db.add(extraction_log)
            db.commit()
        except:
            pass  # Don't fail if logging fails
        
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting dose: {str(e)}"
        )

@router.post("/save-dose", response_model=DoseSaveResponse)
async def save_dose(
    request: DoseSaveRequest,
    db: Session = Depends(get_db)
):
    """
    Save dose information to database
    
    - **study_instance_uid**: Unique identifier for the study
    - **patient_id**: Patient ID
    - **patient_name**: Patient name
    - **ctdivol_mgy**: CTDIvol value in mGy
    - **total_dlp_mgycm**: Total DLP value in mGy*cm
    - **manufacturer**: Equipment manufacturer
    - **station_name**: Station name
    """
    try:
        # Best-effort enrichment from Orthanc if some fields are missing
        # Detect missing values directly from the request model to avoid treating omitted fields as explicit None
        need_enrich = any(getattr(request, k) is None for k in [
            "patient_sex", "patient_age_years", "patient_weight_kg", "exam_type", "sequence_count", "contrast_used"
        ]) or (request.study_date and isinstance(request.study_date, str) and len(request.study_date) == 8 and request.study_date.isdigit())
        if need_enrich and request.study_instance_uid:
            try:
                study_id = dose_extractor._find_study_by_uid(request.study_instance_uid)
                if study_id:
                    study_info = dose_extractor.client.get_study_info(study_id) or {}
                    main_tags = study_info.get("MainDicomTags", {})
                    patient_tags = study_info.get("PatientMainDicomTags", {})

                    def _parse_age_years(val: str):
                        if not val:
                            return None
                        try:
                            v = str(val).strip().upper()
                            if v.endswith("Y"):
                                return float(v[:-1])
                            if v.endswith("M"):
                                return round(float(v[:-1]) / 12.0, 2)
                            if v.endswith("D"):
                                return round(float(v[:-1]) / 365.0, 2)
                            return float(v)
                        except Exception:
                            return None
                    def _parse_float(val):
                        try:
                            return float(val)
                        except Exception:
                            return None

                    # Helpers
                    def _fmt_ddmmyyyy(d):
                        try:
                            d = str(d)
                            if len(d) == 8 and d.isdigit():
                                return f"{d[6:8]}/{d[4:6]}/{d[0:4]}"
                        except Exception:
                            pass
                        return d or None

                    # Build a dict from provided fields only (exclude None)
                    data = request.dict(exclude_none=True)

                    # Fill missing fields
                    if data.get("patient_sex") is None:
                        sex_raw = patient_tags.get("PatientSex")
                        if isinstance(sex_raw, str):
                            s = sex_raw.strip().upper()
                            data["patient_sex"] = "Male" if s == "M" else ("Female" if s == "F" else sex_raw)
                        else:
                            data["patient_sex"] = sex_raw
                    if data.get("patient_age_years") is None:
                        data["patient_age_years"] = _parse_age_years(patient_tags.get("PatientAge"))
                    if data.get("patient_weight_kg") is None:
                        data["patient_weight_kg"] = _parse_float(patient_tags.get("PatientWeight"))
                    if data.get("exam_type") is None:
                        data["exam_type"] = main_tags.get("StudyDescription") or main_tags.get("SeriesDescription") or main_tags.get("BodyPartExamined")
                    # Convert study_date to DD/MM/YYYY if provided in YYYYMMDD
                    if data.get("study_date"):
                        data["study_date"] = _fmt_ddmmyyyy(data.get("study_date"))

                    # sequence_count detection if missing
                    if data.get("sequence_count") is None:
                        try:
                            series_ids = dose_extractor.client.get_study_series(study_id)
                            ct_series_count = 0
                            for series_id in series_ids:
                                series_info = dose_extractor.client.get_series_info(series_id) or {}
                                mt = series_info.get("MainDicomTags", {})
                                if mt.get("Modality") == "CT":
                                    ct_series_count += 1
                            data["sequence_count"] = ct_series_count if ct_series_count > 0 else None
                        except Exception:
                            pass

                    # contrast_used detection defaulting to False when not found
                    if data.get("contrast_used") is None:
                        try:
                            series_ids = dose_extractor.client.get_study_series(study_id)
                            found_contrast = False
                            for series_id in series_ids:
                                series_info = dose_extractor.client.get_series_info(series_id) or {}
                                mt = series_info.get("MainDicomTags", {})
                                if mt.get("Modality") != "CT":
                                    continue
                                instances = dose_extractor.client.get_series_instances(series_id) or []
                                for inst in instances[:1]:
                                    tags = dose_extractor.client.get_instance_tags(inst) or {}
                                    agent = tags.get("0018,0010") or tags.get("ContrastBolusAgent")
                                    vol = tags.get("0018,1041") or tags.get("ContrastBolusVolume")
                                    has_agent = False
                                    vol_val = None
                                    try:
                                        if isinstance(agent, dict):
                                            av = agent.get("Value")
                                            has_agent = av is not None and (av if not isinstance(av, list) else (av[0] if av else None)) not in [None, "", []]
                                        elif isinstance(agent, str):
                                            has_agent = agent.strip() != ""
                                        if isinstance(vol, dict):
                                            vv = vol.get("Value")
                                            vol_val = vv[0] if isinstance(vv, list) and vv else vv
                                        elif isinstance(vol, (int, float, str)):
                                            vol_val = vol
                                    except Exception:
                                        pass
                                    try:
                                        found_contrast = bool(has_agent or ((float(vol_val) if vol_val is not None else 0) > 0))
                                    except Exception:
                                        found_contrast = bool(has_agent)
                                    if found_contrast:
                                        break
                                if found_contrast:
                                    break
                            data["contrast_used"] = True if found_contrast else False
                        except Exception:
                            # default Non Kontras if detection fails
                            data["contrast_used"] = False

                    # Rebuild request object with enriched data (keep omitted fields unset)
                    request = DoseSaveRequest(**data)
            except Exception:
                # Ignore enrichment errors
                pass
        # Check if record already exists
        # Compute IDRL status based on available fields
        try:
            idrl = compute_idrl_status(
                exam_type=request.exam_type,
                contrast_used=request.contrast_used,
                sequence_count=request.sequence_count,
                ctdivol_mgy=request.ctdivol_mgy,
                total_dlp_mgycm=request.total_dlp_mgycm,
            )
            # Update request with IDRL evaluation
            request.idrl_category = idrl.get("category")
            request.idrl_ctdivol_limit_mgy = idrl.get("ctdivol_limit_mgy")
            request.idrl_dlp_limit_mgycm = idrl.get("dlp_limit_mgycm")
            request.idrl_status = idrl.get("status")
        except Exception:
            pass

        # Check if record already exists
        existing_record = db.query(DoseRecord).filter(
            DoseRecord.study_instance_uid == request.study_instance_uid
        ).first()
        
        if existing_record:
            # Update existing record; ignore None values to prevent wiping existing data
            for field, value in request.dict(exclude_unset=True, exclude_none=True).items():
                if hasattr(existing_record, field):
                    setattr(existing_record, field, value)
            
            db.commit()
            db.refresh(existing_record)
            
            return DoseSaveResponse(
                id=existing_record.id,
                study_instance_uid=existing_record.study_instance_uid,
                message="Dose record updated successfully",
                created_at=existing_record.created_at
            )
        else:
            # Create new record
            dose_record = DoseRecord(**request.dict())
            db.add(dose_record)
            db.commit()
            db.refresh(dose_record)
            
            return DoseSaveResponse(
                id=dose_record.id,
                study_instance_uid=dose_record.study_instance_uid,
                message="Dose record saved successfully",
                created_at=dose_record.created_at
            )
            
    except Exception as e:
        logger.error(f"Error saving dose record: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error saving dose record: {str(e)}"
        )

@router.post("/extract-and-save-dose", response_model=DoseSaveResponse)
async def extract_and_save_dose(
    request: DoseExtractionRequest,
    db: Session = Depends(get_db)
):
    """
    Extract dose information and save it to database in one operation
    
    - **study_instance_uid**: The StudyInstanceUID to extract dose from
    """
    try:
        # First extract dose information
        dose_data = dose_extractor.extract_dose_from_study(request.study_instance_uid)
        
        if dose_data["extraction_status"] == "FAILED":
            raise HTTPException(
                status_code=422,
                detail=f"Failed to extract dose: {dose_data.get('extraction_notes', 'Unknown error')}"
            )
        
        # Get basic study information from Orthanc
        study_id = dose_extractor._find_study_by_uid(request.study_instance_uid)
        if not study_id:
            raise HTTPException(
                status_code=404,
                detail="Study not found in Orthanc"
            )
        
        study_info = dose_extractor.client.get_study_info(study_id)
        if not study_info:
            raise HTTPException(
                status_code=404,
                detail="Cannot retrieve study information"
            )
        
        # Extract patient information
        main_tags = study_info.get("MainDicomTags", {})
        patient_tags = study_info.get("PatientMainDicomTags", {})
        
        # Derive additional patient/study fields
        sex_raw = patient_tags.get("PatientSex")
        sex = None
        if isinstance(sex_raw, str):
            s = sex_raw.strip().upper()
            if s == "M":
                sex = "Male"
            elif s == "F":
                sex = "Female"
            else:
                sex = sex_raw
        age_raw = patient_tags.get("PatientAge")
        weight_raw = patient_tags.get("PatientWeight")
        def _parse_age_years(val: str):
            if not val:
                return None
            try:
                v = str(val).strip().upper()
                if v.endswith("Y"):
                    return float(v[:-1])
                if v.endswith("M"):
                    return round(float(v[:-1]) / 12.0, 2)
                if v.endswith("D"):
                    return round(float(v[:-1]) / 365.0, 2)
                return float(v)
            except Exception:
                return None
        def _parse_float(val):
            try:
                return float(val)
            except Exception:
                return None

        def _fmt_ddmmyyyy(d):
            try:
                d = str(d)
                if len(d) == 8 and d.isdigit():
                    return f"{d[6:8]}/{d[4:6]}/{d[0:4]}"
            except Exception:
                pass
            return d or None

        exam_type = main_tags.get("StudyDescription") or main_tags.get("SeriesDescription") or None
        if not exam_type:
            body_part = main_tags.get("BodyPartExamined")
            if body_part:
                exam_type = f"CT {body_part}"

        # Compute CT series count and contrast flag (best-effort)
        series_ids = dose_extractor.client.get_study_series(study_id)
        ct_series_count = 0
        contrast_used = False
        try:
            for series_id in series_ids:
                series_info = dose_extractor.client.get_series_info(series_id)
                if not series_info:
                    continue
                mt = series_info.get("MainDicomTags", {})
                if mt.get("Modality") == "CT":
                    ct_series_count += 1
                    # Peek first instance for contrast info
                    instances = dose_extractor.client.get_series_instances(series_id)
                    for inst in instances[:1]:
                        tags = dose_extractor.client.get_instance_tags(inst) or {}
                        agent = tags.get("0018,0010") or tags.get("0018,0010".lower())
                        vol = tags.get("0018,1041") or tags.get("0018,1041".lower())
                        try:
                            has_agent = isinstance(agent, dict) and agent.get("Value") is not None
                            vol_val = None
                            if isinstance(vol, dict):
                                vv = vol.get("Value")
                                vol_val = vv[0] if isinstance(vv, list) and vv else vv
                            contrast_used = bool(has_agent or (_parse_float(vol_val) and _parse_float(vol_val) > 0))
                        except Exception:
                            pass
                        if contrast_used:
                            break
                if contrast_used:
                    break
        except Exception:
            pass

        # Create save request with extended fields
        save_request = DoseSaveRequest(
            study_instance_uid=request.study_instance_uid,
            patient_id=patient_tags.get("PatientID", ""),
            patient_name=patient_tags.get("PatientName", ""),
            study_date=_fmt_ddmmyyyy(main_tags.get("StudyDate", "")),
            patient_sex=sex,
            patient_age_years=_parse_age_years(age_raw) if age_raw else None,
            patient_weight_kg=_parse_float(weight_raw) if weight_raw is not None else None,
            exam_type=exam_type,
            contrast_used=contrast_used,
            sequence_count=ct_series_count if ct_series_count > 0 else None,
            ctdivol_mgy=dose_data.get("ctdivol_mgy"),
            ctdivol_average_mgy=dose_data.get("ctdivol_average_mgy"),
            total_dlp_mgycm=dose_data.get("total_dlp_mgycm"),
            manufacturer=dose_data.get("manufacturer"),
            station_name=dose_data.get("station_name"),
            extraction_method=dose_data.get("extraction_method"),
            extraction_status=dose_data.get("extraction_status"),
            extraction_notes=dose_data.get("extraction_notes")
        )

        # Compute and attach IDRL status
        try:
            idrl = compute_idrl_status(
                exam_type=save_request.exam_type,
                contrast_used=save_request.contrast_used,
                sequence_count=save_request.sequence_count,
                ctdivol_mgy=save_request.ctdivol_mgy,
                total_dlp_mgycm=save_request.total_dlp_mgycm,
            )
            save_request.idrl_category = idrl.get("category")
            save_request.idrl_ctdivol_limit_mgy = idrl.get("ctdivol_limit_mgy")
            save_request.idrl_dlp_limit_mgycm = idrl.get("dlp_limit_mgycm")
            save_request.idrl_status = idrl.get("status")
        except Exception:
            pass
        
        # Save to database
        return await save_dose(save_request, db)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in extract-and-save operation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error in extract-and-save operation: {str(e)}"
        )

@router.post("/study-tags", response_model=StudyTagsResponse)
async def get_study_tags(request: StudyTagsRequest):
    """
    Retrieve DICOM tags from a representative instance in the study.
    Preference order: SR instance > Localizer instance > first CT instance.
    """
    try:
        study_id = dose_extractor._find_study_by_uid(request.study_instance_uid)
        if not study_id:
            return StudyTagsResponse(
                study_instance_uid=request.study_instance_uid,
                status="FAILED",
                notes="Study not found in Orthanc",
                tags={},
            )

        # Try SR series
        sr_series = dose_extractor.client.find_dose_report_series(study_id)
        for series_id in sr_series:
            instances = dose_extractor.client.get_series_instances(series_id)
            for instance_id in instances:
                tags = dose_extractor.client.get_instance_tags(instance_id)
                if tags:
                    return StudyTagsResponse(
                        study_instance_uid=request.study_instance_uid,
                        status="SUCCESS",
                        source="SR",
                        notes="Tags from Structured Report instance",
                        tags=tags,
                    )

        # Try Localizer series
        loc_series = dose_extractor.client.find_localizer_series(study_id)
        for series_id in loc_series:
            instances = dose_extractor.client.get_series_instances(series_id)
            for instance_id in instances:
                tags = dose_extractor.client.get_instance_tags(instance_id)
                if tags:
                    return StudyTagsResponse(
                        study_instance_uid=request.study_instance_uid,
                        status="SUCCESS",
                        source="LOCALIZER",
                        notes="Tags from Localizer/Topogram instance",
                        tags=tags,
                    )

        # Fallback: any CT series first instance
        series_ids = dose_extractor.client.get_study_series(study_id)
        for series_id in series_ids:
            series_info = dose_extractor.client.get_series_info(series_id)
            if not series_info:
                continue
            main_tags = series_info.get("MainDicomTags", {})
            if main_tags.get("Modality") == "CT":
                instances = dose_extractor.client.get_series_instances(series_id)
                if instances:
                    tags = dose_extractor.client.get_instance_tags(instances[0])
                    if tags:
                        return StudyTagsResponse(
                            study_instance_uid=request.study_instance_uid,
                            status="SUCCESS",
                            source="CT",
                            notes="Tags from first CT series instance",
                            tags=tags,
                        )

        return StudyTagsResponse(
            study_instance_uid=request.study_instance_uid,
            status="FAILED",
            notes="No tags found in SR/Localizer/CT instances",
            tags={},
        )
    except Exception as e:
        logger.error(f"Error retrieving study tags: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving study tags: {str(e)}")
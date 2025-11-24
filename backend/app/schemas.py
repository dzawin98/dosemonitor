from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# Patient and Study schemas
class StudyInfo(BaseModel):
    study_instance_uid: str
    patient_id: str
    patient_name: str
    study_date: Optional[str] = None
    modality: str = "CT"
    # Additional patient/study fields for worklist display
    patient_birth_date: Optional[str] = None
    patient_sex: Optional[str] = None
    patient_age_years: Optional[float] = None
    patient_weight_kg: Optional[float] = None
    study_description: Optional[str] = None
    modalities_in_study: Optional[str] = None
    accession_number: Optional[str] = None

class PatientListResponse(BaseModel):
    studies: List[StudyInfo]
    total_count: int

# Dose extraction schemas
class DoseExtractionRequest(BaseModel):
    study_instance_uid: str

class DoseExtractionResponse(BaseModel):
    study_instance_uid: str
    ctdivol_mgy: Optional[float] = None
    ctdivol_average_mgy: Optional[float] = None
    ctdivol_values: Optional[List[float]] = None
    class CTDIVolSeriesItem(BaseModel):
        label: str
        value: float
    ctdivol_series: Optional[List[CTDIVolSeriesItem]] = None
    total_dlp_mgycm: Optional[float] = None
    manufacturer: Optional[str] = None
    station_name: Optional[str] = None
    extraction_method: Optional[str] = None
    extraction_status: str
    extraction_notes: Optional[str] = None

# Tags schemas
class StudyTagsRequest(BaseModel):
    study_instance_uid: str

class StudyTagsResponse(BaseModel):
    study_instance_uid: str
    status: str
    source: Optional[str] = None
    notes: Optional[str] = None
    tags: Dict[str, Any] = {}

# Dose saving schemas
class DoseSaveRequest(BaseModel):
    study_instance_uid: str
    patient_id: str
    patient_name: str
    study_date: Optional[str] = None
    # Additional patient/study fields
    patient_sex: Optional[str] = None
    patient_age_years: Optional[float] = None
    patient_weight_kg: Optional[float] = None
    exam_type: Optional[str] = None
    contrast_used: Optional[bool] = None
    sequence_count: Optional[int] = None
    ctdivol_mgy: Optional[float] = None
    ctdivol_average_mgy: Optional[float] = None
    total_dlp_mgycm: Optional[float] = None
    manufacturer: Optional[str] = None
    station_name: Optional[str] = None
    extraction_method: Optional[str] = None
    extraction_status: str = "SUCCESS"
    extraction_notes: Optional[str] = None
    # IDRL evaluation (computed server-side but allowed in payload for completeness)
    idrl_category: Optional[str] = None
    idrl_ctdivol_limit_mgy: Optional[float] = None
    idrl_dlp_limit_mgycm: Optional[float] = None
    idrl_status: Optional[str] = None

class DoseSaveResponse(BaseModel):
    id: int
    study_instance_uid: str
    message: str
    created_at: datetime

# Reporting schemas
class DoseRecordResponse(BaseModel):
    id: int
    study_instance_uid: str
    patient_id: str
    patient_name: str
    study_date: Optional[str]
    modality: str
    patient_sex: Optional[str]
    patient_age_years: Optional[float]
    patient_weight_kg: Optional[float]
    exam_type: Optional[str]
    contrast_used: Optional[bool]
    sequence_count: Optional[int]
    ctdivol_mgy: Optional[float]
    ctdivol_average_mgy: Optional[float]
    total_dlp_mgycm: Optional[float]
    manufacturer: Optional[str]
    station_name: Optional[str]
    extraction_method: Optional[str]
    extraction_status: str
    created_at: datetime
    updated_at: Optional[datetime]
    # IDRL evaluation
    idrl_category: Optional[str]
    idrl_ctdivol_limit_mgy: Optional[float]
    idrl_dlp_limit_mgycm: Optional[float]
    idrl_status: Optional[str]

    class Config:
        from_attributes = True

class ReportingDataResponse(BaseModel):
    records: List[DoseRecordResponse]
    total_count: int
    summary: dict

# Error schemas
class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    study_instance_uid: Optional[str] = None

# Auth and user schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    username: str
    role: str

class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = "user"
    is_active: Optional[bool] = True

class UserUpdateRequest(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UsersListResponse(BaseModel):
    users: List[UserResponse]

# Orthanc config schemas
class OrthancConfigResponse(BaseModel):
    base_url: str
    username: Optional[str] = None
    auth_enabled: bool

class OrthancConfigUpdateRequest(BaseModel):
    base_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

# Database config schemas
class DatabaseConfigResponse(BaseModel):
    driver: str
    host: str
    port: int
    database: str
    username: Optional[str] = None
    password_set: bool

class DatabaseConfigUpdateRequest(BaseModel):
    host: str
    port: int
    database: str
    username: str
    password: str

class DatabaseTestRequest(BaseModel):
    host: str
    port: int
    database: str
    username: str
    password: str

class DatabaseTestResponse(BaseModel):
    success: bool
    message: str
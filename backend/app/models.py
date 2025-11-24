from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base

class DoseRecord(Base):
    __tablename__ = "dose_records"
    
    id = Column(Integer, primary_key=True, index=True)
    study_instance_uid = Column(String(255), unique=True, index=True, nullable=False)
    patient_id = Column(String(255), index=True, nullable=False)
    patient_name = Column(String(255), nullable=False)
    study_date = Column(String(20), nullable=True)
    modality = Column(String(10), default="CT")
    # Patient & study details
    patient_sex = Column(String(10), nullable=True)
    patient_age_years = Column(Float, nullable=True)
    patient_weight_kg = Column(Float, nullable=True)
    exam_type = Column(String(255), nullable=True)
    contrast_used = Column(Boolean, nullable=True)
    sequence_count = Column(Integer, nullable=True)
    
    # Dose information
    ctdivol_mgy = Column(Float, nullable=True)
    ctdivol_average_mgy = Column(Float, nullable=True)
    total_dlp_mgycm = Column(Float, nullable=True)

    # Equipment information
    manufacturer = Column(String(255), nullable=True)
    station_name = Column(String(255), nullable=True)

    # IDRL (BAPETEN) evaluation
    idrl_category = Column(String(255), nullable=True)
    idrl_ctdivol_limit_mgy = Column(Float, nullable=True)
    idrl_dlp_limit_mgycm = Column(Float, nullable=True)
    idrl_status = Column(String(20), nullable=True)  # "Normal" or "Melewati batas"
    
    # Extraction metadata
    extraction_method = Column(String(50), nullable=True)  # 'SR', 'LOCALIZER', 'MANUAL'
    extraction_status = Column(String(20), default="SUCCESS")  # 'SUCCESS', 'PARTIAL', 'FAILED'
    extraction_notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<DoseRecord(study_uid={self.study_instance_uid}, patient_id={self.patient_id})>"

class ExtractionLog(Base):
    __tablename__ = "extraction_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    study_instance_uid = Column(String(255), index=True, nullable=False)
    extraction_attempt = Column(Integer, default=1)
    method_used = Column(String(50), nullable=False)
    success = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    processing_time_seconds = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<ExtractionLog(study_uid={self.study_instance_uid}, method={self.method_used})>"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<User(username={self.username}, role={self.role})>"
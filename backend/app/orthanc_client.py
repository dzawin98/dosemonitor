import requests
import json
import os
from typing import Dict, List, Optional, Any
from requests.auth import HTTPBasicAuth
import logging

logger = logging.getLogger(__name__)

class OrthancClient:
    def __init__(self):
        self.base_url = os.getenv("ORTHANC_URL", "http://localhost:8042")
        self.username = os.getenv("ORTHANC_USER", "").strip()
        self.password = os.getenv("ORTHANC_PASSWORD", "").strip()
        self.auth = None
        if self.username and self.password:
            self.auth = HTTPBasicAuth(self.username, self.password)
        self.session = requests.Session()
        # Only set auth if credentials are provided
        if self.auth:
            self.session.auth = self.auth
        
    def _get_json(self, endpoint: str) -> Optional[Dict]:
        """Helper function to make GET requests to Orthanc API"""
        try:
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"GET request failed for {endpoint}: {str(e)}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error for {endpoint}: {str(e)}")
            return None
    
    def _post_json(self, endpoint: str, data: Dict) -> Optional[Dict]:
        """Helper function to make POST requests to Orthanc API"""
        try:
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
            response = self.session.post(
                url, 
                json=data, 
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"POST request failed for {endpoint}: {str(e)}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error for {endpoint}: {str(e)}")
            return None
    
    def get_studies(self, limit: int = 100) -> List[str]:
        """Get list of study IDs from Orthanc"""
        studies = self._get_json("studies")
        if studies is None:
            return []
        return studies[:limit]
    
    def get_study_info(self, study_id: str) -> Optional[Dict]:
        """Get detailed information about a study"""
        return self._get_json(f"studies/{study_id}")
    
    def find_ct_studies(self, limit: int = 100, modality: str = "CT") -> List[Dict]:
        """Find studies by modality using Orthanc's find tool (Study level)."""
        # At Study level, use tag 'ModalitiesInStudy' to match modality presence
        query = {
            "Level": "Study",
            "Query": {
                "ModalitiesInStudy": modality
            },
            "Limit": limit
        }
        
        result = self._post_json("tools/find", query)
        if result is None:
            return []
        # Orthanc may return a list or an object with 'value' array
        if isinstance(result, dict):
            ids = result.get("value") or result.get("Results") or []
        else:
            ids = result
        
        studies = []
        for study_id in ids:
            study_info = self.get_study_info(study_id)
            if study_info:
                # Extract main tags
                main_tags = study_info.get("MainDicomTags", {})
                patient_main_tags = study_info.get("PatientMainDicomTags", {})
                
                study_data = {
                    "study_instance_uid": main_tags.get("StudyInstanceUID", ""),
                    "patient_id": patient_main_tags.get("PatientID", ""),
                    "patient_name": patient_main_tags.get("PatientName", ""),
                    "study_date": main_tags.get("StudyDate", ""),
                    "modality": modality,
                    "orthanc_id": study_id
                }
                studies.append(study_data)
        
        return studies
    
    def get_study_series(self, study_id: str) -> List[str]:
        """Get all series IDs for a study"""
        study_info = self.get_study_info(study_id)
        if study_info is None:
            return []
        return study_info.get("Series", [])
    
    def get_series_info(self, series_id: str) -> Optional[Dict]:
        """Get detailed information about a series"""
        return self._get_json(f"series/{series_id}")
    
    def get_series_instances(self, series_id: str) -> List[str]:
        """Get all instance IDs for a series"""
        series_info = self.get_series_info(series_id)
        if series_info is None:
            return []
        return series_info.get("Instances", [])
    
    def get_instance_info(self, instance_id: str) -> Optional[Dict]:
        """Get detailed information about an instance"""
        return self._get_json(f"instances/{instance_id}")
    
    def get_instance_tags(self, instance_id: str) -> Optional[Dict]:
        """Get DICOM tags for an instance"""
        return self._get_json(f"instances/{instance_id}/tags")
    
    def get_instance_simplified_tags(self, instance_id: str) -> Optional[Dict]:
        """Get simplified DICOM tags for an instance"""
        return self._get_json(f"instances/{instance_id}/simplified-tags")
    
    def find_dose_report_series(self, study_id: str) -> List[str]:
        """Find Structured Report (SR) series that might contain dose information"""
        series_ids = self.get_study_series(study_id)
        dose_series = []
        
        for series_id in series_ids:
            series_info = self.get_series_info(series_id)
            if series_info is None:
                continue
                
            main_tags = series_info.get("MainDicomTags", {})
            modality = main_tags.get("Modality", "")
            series_description = main_tags.get("SeriesDescription", "").upper()
            
            # Look for SR modality or dose-related series descriptions
            if (modality == "SR" or 
                "DOSE" in series_description or 
                "REPORT" in series_description):
                dose_series.append(series_id)
        
        return dose_series
    
    def find_localizer_series(self, study_id: str) -> List[str]:
        """Find localizer/topogram series"""
        series_ids = self.get_study_series(study_id)
        localizer_series = []
        
        for series_id in series_ids:
            series_info = self.get_series_info(series_id)
            if series_info is None:
                continue
                
            main_tags = series_info.get("MainDicomTags", {})
            series_description = main_tags.get("SeriesDescription", "").upper()
            
            # Look for localizer/topogram series
            if ("LOCALIZER" in series_description or 
                "TOPOGRAM" in series_description or
                "SCOUT" in series_description):
                localizer_series.append(series_id)
        
        return localizer_series
    
    def test_connection(self) -> bool:
        """Test connection to Orthanc server"""
        try:
            system_info = self._get_json("system")
            return system_info is not None
        except Exception as e:
            logger.error(f"Connection test failed: {str(e)}")
            return False

# Global instance
orthanc_client = OrthancClient()
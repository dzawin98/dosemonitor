import os
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_MAPPING_CACHE: Optional[Dict[str, Any]] = None


DEFAULT_MAPPING: Dict[str, Any] = {
    "default": {
        "exam": [
            "StudyDescription",
            "0008,1030",
            "SeriesDescription",
            "0008,103E",
            "BodyPartExamined",
            "0018,0015",
        ],
        "accession": ["AccessionNumber", "0008,0050"],
        "birth_date": ["PatientBirthDate", "0010,0030"],
        "age": ["PatientAge", "0010,1010"],
        "sex": ["PatientSex", "0010,0040"],
    },
    "CT": {
        "exam": [
            "StudyDescription",
            "0008,1030",
            "SeriesDescription",
            "0008,103E",
            "BodyPartExamined",
            "0018,0015",
        ]
    },
    "MR": {
        "exam": [
            "StudyDescription",
            "0008,1030",
            "ProtocolName",
            "0018,1030",
            "SeriesDescription",
            "0008,103E",
        ]
    },
    "XA": {"exam": ["StudyDescription", "0008,1030", "SeriesDescription", "0008,103E"]},
    "CR": {"exam": ["StudyDescription", "0008,1030", "BodyPartExamined", "0018,0015"]},
}


def _config_path() -> str:
    return os.path.join(os.path.dirname(__file__), "config", "dicom_mapping.json")


def load_mapping() -> Dict[str, Any]:
    """Load mapping JSON from disk with caching and fallback to DEFAULT_MAPPING."""
    global _MAPPING_CACHE
    if _MAPPING_CACHE is not None:
        return _MAPPING_CACHE
    path = _config_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                _MAPPING_CACHE = json.load(f)
                return _MAPPING_CACHE
    except Exception as e:
        logger.warning(f"Failed to load dicom_mapping.json: {e}. Using default mapping.")
    _MAPPING_CACHE = DEFAULT_MAPPING
    return _MAPPING_CACHE


def get_mapping_for_modality(modality: Optional[str]) -> Dict[str, Any]:
    """Return mapping dict for a modality merged on top of default."""
    m = (modality or "").upper().strip()
    mapping = load_mapping()
    default = mapping.get("default", {})
    specific = mapping.get(m, {}) if m else {}
    merged = dict(default)
    # Overwrite keys if specific provides them
    for k, v in specific.items():
        merged[k] = v
    return merged


def pick_tag(tags: Dict[str, Any], prefs: List[str]) -> Optional[Any]:
    """
    Pick the first non-empty tag value from prefs.
    Supports both Orthanc "MainDicomTags" (keyword keys) and instance tags with coded keys.
    """
    if not prefs:
        return None
    # Fast path: direct keyword lookup
    for p in prefs:
        if p in tags:
            val = tags.get(p)
            if _has_value(val):
                return _normalize_val(val)
    # Fallback: scan coded entries like "0008,1030" => {Name: ..., Value: ...}
    for p in prefs:
        entry = tags.get(p)
        if isinstance(entry, dict):
            val = entry.get("Value")
            if _has_value(val):
                return _normalize_val(val)
        # If not directly present, scan all dict entries to match Name
        for k, v in tags.items():
            if isinstance(v, dict) and v.get("Name") == p:
                val = v.get("Value")
                if _has_value(val):
                    return _normalize_val(val)
    return None


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, list):
        return len(value) > 0 and any(str(x).strip() != "" for x in value)
    return str(value).strip() != ""


def _normalize_val(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value
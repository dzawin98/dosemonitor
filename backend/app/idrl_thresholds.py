import re
from typing import Optional, Tuple, Dict


# Thresholds per BAPETEN Indonesia table (CT modality)
# Values given in mGy (CTDIvol) and mGy*cm (Total DLP)
IDRL_THRESHOLDS: Dict[str, Dict[str, Tuple[float, float]]] = {
    "Non Kontras": {
        "Kepala Non Kontras": (60.0, 1275.0),
        "Thorax Non Kontras": (16.0, 600.0),
        "Abdomen Non Kontras": (20.0, 740.0),
        "Pelvis Non Kontras": (20.0, 740.0),
        "Lumbal (Lumbosacral)": (26.0, 550.0),
        "Angiografi (Angio) Kepala": (60.0, 1275.0),
    },
    "Kontras": {
        "Kepala Kontras": (60.0, 1275.0),
        "Thorax Kontras": (16.0, 600.0),
        "Abdomen Kontras": (20.0, 740.0),
        "Pelvis Kontras": (20.0, 740.0),
        "Abdomen dan Pelvis Kontras": (20.0, 1480.0),
        "Abdomen/Pelvis Multiphase (3 fase)": (20.0, 2220.0),
        "Angiografi (Angio) Thorax/Pulmonal": (16.0, 600.0),
    },
}


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().upper()


def classify_exam(
    exam_type: Optional[str],
    contrast_used: Optional[bool],
    sequence_count: Optional[int] = None,
) -> Tuple[Optional[str], Optional[Tuple[float, float]]]:
    """Classify exam to BAPETEN IDRL category and return thresholds.

    Returns (category_name, (ctdivol_limit, dlp_limit)) or (None, None) if unknown.
    """
    text = _norm(exam_type)
    is_contrast = bool(contrast_used)
    has_sinus = any(w in text for w in ["SINUS", "PARANASAL", "SINUSES"])

    # Basic body-part detection
    has_head = any(w in text for w in ["HEAD", "BRAIN", "KEPALA"])
    has_thorax = any(w in text for w in ["CHEST", "THORAX", "THORAX", "THORACIC", "PULMON", "LUNG", "CARDIAC", "JANTUNG"])
    has_abdomen = "ABDOM" in text
    has_pelvis = "PELVIS" in text or "PELVIC" in text
    has_lumbar = any(w in text for w in ["LUMBAR", "LUMBOSACRAL", "LUMBAL"])
    has_angio = any(w in text for w in ["ANGIO", "CTA"])  # CTA commonly used for CT angiography

    # Multiphase detection (3 fase)
    is_multiphase = False
    if sequence_count is not None and sequence_count >= 3 and (has_abdomen or has_pelvis or (has_abdomen and has_pelvis)):
        is_multiphase = True
    # Also detect by text keywords
    if re.search(r"\b(3\s*PHASE|THREE\s*PHASE|MULTIPHASE|3\s*FASE)\b", text):
        is_multiphase = True

    if has_sinus:
        cat = "Sinuses Paranasal CT"
        group = "Kontras" if is_contrast else "Non Kontras"
        return cat, IDRL_THRESHOLDS[group].get(cat)

    # Combined Abdomen + Pelvis
    has_abd_pel = has_abdomen and has_pelvis
    if has_abd_pel and is_contrast:
        if is_multiphase:
            cat = "Abdomen/Pelvis Multiphase (3 fase)"
            return cat, IDRL_THRESHOLDS["Kontras"].get(cat)
        cat = "Abdomen dan Pelvis Kontras"
        return cat, IDRL_THRESHOLDS["Kontras"].get(cat)

    # Angio categories
    if has_angio and (has_head or "NECK" in text or "KAROTID" in text):
        cat = "Angiografi (Angio) Kepala"
        group = "Kontras" if is_contrast else "Non Kontras"
        return cat, IDRL_THRESHOLDS[group].get(cat)
    if has_angio and (has_thorax or "PULMON" in text or "PULMONAL" in text):
        cat = "Angiografi (Angio) Thorax/Pulmonal"
        # In table this resides under Kontras
        return cat, IDRL_THRESHOLDS["Kontras"].get(cat)

    # Single-region categories
    if has_head:
        cat = "Kepala Kontras" if is_contrast else "Kepala Non Kontras"
        group = "Kontras" if is_contrast else "Non Kontras"
        return cat, IDRL_THRESHOLDS[group].get(cat)
    if has_thorax:
        cat = "Thorax Kontras" if is_contrast else "Thorax Non Kontras"
        group = "Kontras" if is_contrast else "Non Kontras"
        return cat, IDRL_THRESHOLDS[group].get(cat)
    if has_abdomen and not has_pelvis:
        cat = "Abdomen Kontras" if is_contrast else "Abdomen Non Kontras"
        group = "Kontras" if is_contrast else "Non Kontras"
        return cat, IDRL_THRESHOLDS[group].get(cat)
    if has_pelvis and not has_abdomen:
        cat = "Pelvis Kontras" if is_contrast else "Pelvis Non Kontras"
        group = "Kontras" if is_contrast else "Non Kontras"
        return cat, IDRL_THRESHOLDS[group].get(cat)
    if has_lumbar:
        # Lumbal threshold only provided under Non Kontras
        cat = "Lumbal (Lumbosacral)"
        return cat, IDRL_THRESHOLDS["Non Kontras"].get(cat)

    # Fallback: try to infer from words like "CT ABDOMEN PELVIS"
    if "ABDOMEN" in text and "PELVIS" in text:
        if is_contrast:
            cat = "Abdomen dan Pelvis Kontras"
            return cat, IDRL_THRESHOLDS["Kontras"].get(cat)
        # No explicit non-contrast combined threshold; default to abdomen non-contrast
        cat = "Abdomen Non Kontras"
        return cat, IDRL_THRESHOLDS["Non Kontras"].get(cat)

    # Unknown
    return None, None


def compute_idrl_status(
    exam_type: Optional[str],
    contrast_used: Optional[bool],
    sequence_count: Optional[int],
    ctdivol_mgy: Optional[float],
    total_dlp_mgycm: Optional[float],
    ctdivol_average_mgy: Optional[float] = None,
) -> Dict[str, Optional[str]]:
    """Compute IDRL status based on thresholds.

    Returns dict with keys: category, status, ctdivol_limit_mgy, dlp_limit_mgycm.
    Status is "Normal" if all provided values are <= limits; otherwise "Melewati batas".
    If category/limits unknown, status will be None.
    """
    category, limits = classify_exam(exam_type, contrast_used, sequence_count)
    if not limits:
        return {
            "category": category,
            "status": None,
            "ctdivol_limit_mgy": None,
            "dlp_limit_mgycm": None,
        }

    ct_limit, dlp_limit = limits
    status = "Normal"
    # Evaluate using whichever values are present
    ct_for_eval = ctdivol_average_mgy if ctdivol_average_mgy is not None else ctdivol_mgy
    if ct_for_eval is not None and ct_limit is not None and ct_for_eval > ct_limit:
        status = "Melewati batas"
    if total_dlp_mgycm is not None and dlp_limit is not None and total_dlp_mgycm > dlp_limit:
        status = "Melewati batas"

    return {
        "category": category,
        "status": status,
        "ctdivol_limit_mgy": ct_limit,
        "dlp_limit_mgycm": dlp_limit,
    }

# Helpers to align classified categories/exam text with database category keys
# Canonicalization maps for common variants (English/Indonesia, abbreviations)
CATEGORY_DB_ALIASES: Dict[str, str] = {
    "CT HEAD": "CT Head",
    "HEAD": "CT Head",
    "KEPALA": "CT Head",
    "CTA HEAD": "CTA Head",
    "CTA KEPALA": "CTA Head",
    "CT CHEST": "CT Chest",
    "CHEST": "CT Chest",
    "THORAX": "CT Chest",
    "THORACIC": "CT Chest",
    "CT ABDOMEN": "CT ABDOMEN",
    "ABDOMEN": "CT ABDOMEN",
    "WHOLE ABDOMEN": "CT Whole Abdomen",
    "CT WHOLE ABDOMEN": "CT Whole Abdomen",
    "ABDOPELVIS": "CT AbdoPelvis",
    "ABDOMEN PELVIS": "CT AbdoPelvis",
    "ABDOMEN/PELVIS": "CT AbdoPelvis",
    "UROLOGY": "CT Urology",
    "CT UROLOGY": "CT Urology",
    "NASOPHARYNX": "CT Larynx/Nasopharynx",
    "LARYNX": "CT Larynx/Nasopharynx",
    "CT NECK": "CT Neck",
    "NECK": "CT Neck",
    "PELVIS": "CT Pelvis / Hip",
    "HIP": "CT Pelvis / Hip",
    "LUMBAR": "CT Lumbar Spine",
    "LUMBOSACRAL": "CT Lumbar Spine",
    "MASTOID": "CT Mastoids",
    "MASTOIDS": "CT Mastoids",
    "EXTREMITIES": "CT Extremities",
    "CALCIUM SCORE": "CT Calcium Score",
    "CARDIAC": "CT Cardiac Studies",
    "ANGIOGRAPHY": "CT Angiography (CTA)",
    "CTA": "CT Angiography (CTA)",
    "FACIAL BONE": "FACIAL BONE 3D CT",
    "SINUS": "Sinuses Paranasal CT",
    "SINUSES": "Sinuses Paranasal CT",
    "PARANASAL": "Sinuses Paranasal CT",
    "CHEST LOW DOSE": "Chest Low Dose",
    "NECK^NECKROUTINE (ADULT)": "CT Neck",
    "NECKROUTINE": "CT Neck",
    "NECK ROUTINE": "CT Neck",
    "CT NECK ROUTINE": "CT Neck",
}

CLASS_TO_DB: Dict[str, str] = {
    "KEPALA KONTRAS": "CT Head",
    "KEPALA NON KONTRAS": "CT Head",
    "THORAX KONTRAS": "CT Chest",
    "THORAX NON KONTRAS": "CT Chest",
    "ABDOMEN KONTRAS": "CT ABDOMEN",
    "ABDOMEN NON KONTRAS": "CT ABDOMEN",
    "PELVIS KONTRAS": "CT Pelvis / Hip",
    "PELVIS NON KONTRAS": "CT Pelvis / Hip",
    "LUMBAL (LUMBOSACRAL)": "CT Lumbar Spine",
    "ANGIOGRAFI (ANGIO) KEPALA": "CTA Head",
    "ANGIOGRAFI (ANGIO) THORAX/PULMONAL": "CT Angiography (CTA)",
    "ABDOMEN DAN PELVIS KONTRAS": "CT AbdoPelvis",
    "ABDOMEN/PELVIS MULTIPHASE (3 FASE)": "CT AbdoPelvis",
}

def map_to_db_category(exam_type: Optional[str], classified_category: Optional[str]) -> Optional[str]:
    txt = _norm(exam_type)
    if classified_category:
        cc = _norm(classified_category)
        if cc in CLASS_TO_DB:
            return CLASS_TO_DB[cc]
        return classified_category
    for key, target in CATEGORY_DB_ALIASES.items():
        if key in txt:
            return target
    return classified_category

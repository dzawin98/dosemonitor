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

    # Basic body-part detection
    has_head = any(w in text for w in ["HEAD", "BRAIN", "KEPALA"])
    has_thorax = any(w in text for w in ["CHEST", "THORAX", "THORAX", "THORACIC", "PULMON", "LUNG"])
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
    if ctdivol_mgy is not None and ct_limit is not None and ctdivol_mgy > ct_limit:
        status = "Melewati batas"
    if total_dlp_mgycm is not None and dlp_limit is not None and total_dlp_mgycm > dlp_limit:
        status = "Melewati batas"

    return {
        "category": category,
        "status": status,
        "ctdivol_limit_mgy": ct_limit,
        "dlp_limit_mgycm": dlp_limit,
    }
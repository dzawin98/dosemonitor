import logging
from typing import Dict, Optional, List, Any
from app.orthanc_client import orthanc_client

logger = logging.getLogger(__name__)


class DoseExtractor:
    """Class for extracting dose information from DICOM studies"""

    def __init__(self):
        self.client = orthanc_client

    def extract_dose_from_study(self, study_instance_uid: str) -> Dict[str, Any]:
        """
        Main method to extract dose information from a study.
        Returns dict with dose data and extraction metadata.
        """
        result: Dict[str, Any] = {
            "study_instance_uid": study_instance_uid,
            "ctdivol_mgy": None,
            "ctdivol_average_mgy": None,
            "ctdivol_values": [],
            "ctdivol_series": [],
            "total_dlp_mgycm": None,
            "manufacturer": None,
            "station_name": None,
            "extraction_method": None,
            "extraction_status": "FAILED",
            "extraction_notes": "",
        }

        try:
            # Keep SR CTDIvol values separately for averaging (exclude localizer)
            sr_values_for_avg: List[float] = []
            # Locate study in Orthanc
            study_id = self._find_study_by_uid(study_instance_uid)
            if not study_id:
                result["extraction_notes"] = "Study not found in Orthanc"
                return result

            # 1) Structured Report (SR)
            sr_result = self._extract_from_structured_report(study_id)
            if sr_result.get("success"):
                sr_data = sr_result.get("data", {})
                # Copy scalar fields (prefer SR)
                for key in ["ctdivol_mgy", "total_dlp_mgycm", "manufacturer", "station_name"]:
                    if sr_data.get(key) is not None:
                        result[key] = sr_data[key]
                # Collect CTDIvol values from SR
                if sr_data.get("ctdivol_values"):
                    result["ctdivol_values"].extend(sr_data["ctdivol_values"])
                    # Save for averaging (SR only)
                    sr_values_for_avg.extend([
                        v for v in sr_data["ctdivol_values"] if isinstance(v, (int, float))
                    ])
                    for i, v in enumerate(sr_data["ctdivol_values"], start=1):
                        try:
                            result["ctdivol_series"].append({"label": f"SR value #{i}", "value": float(v)})
                        except Exception:
                            pass
                result["extraction_method"] = "SR"
                result["extraction_status"] = "SUCCESS"
                result["extraction_notes"] = "Extracted from Structured Report"

            # 2) Localizer/Topogram
            local_result = self._extract_from_localizer(study_id)
            if local_result.get("success"):
                loc_data = local_result.get("data", {})
                if loc_data.get("ctdivol_values"):
                    result["ctdivol_values"].extend(loc_data["ctdivol_values"])
                # Fill equipment info if SR didn't provide
                for key in ["manufacturer", "station_name"]:
                    if result.get(key) is None and loc_data.get(key) is not None:
                        result[key] = loc_data[key]
                # Label method appropriately
                if result.get("extraction_method") == "SR":
                    result["extraction_method"] = "SR+LOCALIZER"
                    result["extraction_notes"] = "Extracted from Structured Report and Localizer"
                else:
                    result["extraction_method"] = "LOCALIZER"
                    result["extraction_notes"] = "Extracted from Localizer/Topogram"
                # Partial success if only equipment
                if result.get("ctdivol_mgy") or result.get("total_dlp_mgycm"):
                    result["extraction_status"] = "SUCCESS"
                elif result.get("extraction_status") == "FAILED":
                    result["extraction_status"] = "PARTIAL"

            # 3) CT series (equipment fallback)
            ct_result = self._extract_from_ct_series(study_id)
            if ct_result.get("success"):
                ct_data = ct_result.get("data", {})
                for key in ["manufacturer", "station_name"]:
                    if result.get(key) is None and ct_data.get(key) is not None:
                        result[key] = ct_data[key]
                if result.get("extraction_method") is None:
                    result["extraction_method"] = "CT_SERIES"
                    result["extraction_status"] = "PARTIAL"
                    result["extraction_notes"] = "Extracted from CT series metadata"

            try:
                series_ids = self.client.get_study_series(study_id)
                for series_id in series_ids:
                    series_info = self.client.get_series_info(series_id) or {}
                    mt = series_info.get("MainDicomTags", {})
                    modality = mt.get("Modality") or ""
                    series_desc = mt.get("SeriesDescription") or ""
                    instances = self.client.get_series_instances(series_id) or []
                    if not instances:
                        continue
                    tags = self.client.get_instance_tags(instances[0]) or {}
                    key = "0018,9345" if "0018,9345" in tags else "0018,9345".lower()
                    tv = tags.get(key)
                    val = None
                    if isinstance(tv, dict):
                        vv = tv.get("Value")
                        val = vv[0] if isinstance(vv, list) and vv else vv
                    elif isinstance(tv, (int, float, str)):
                        val = tv
                    try:
                        if val is not None:
                            f = float(val)
                            label = series_desc if series_desc else ("Localizer" if modality.upper() in ["SC", "OT"] else "CT")
                            result["ctdivol_series"].append({"label": label, "value": f})
                            result["ctdivol_values"].append(f)
                    except Exception:
                        pass
            except Exception:
                pass

            # Deduplicate combined values for output transparency
            if result["ctdivol_values"]:
                vals = [v for v in result["ctdivol_values"] if isinstance(v, (int, float))]
                vals_unique = self._dedupe_values(vals, tol=1e-4)
                if vals_unique:
                    result["ctdivol_values"] = vals_unique
                    # Set representative ctdivol if not set
                    if result["ctdivol_mgy"] is None:
                        result["ctdivol_mgy"] = vals_unique[0]
                    try:
                        if result.get("ctdivol_series"):
                            seen = set()
                            dedup_series = []
                            for item in result["ctdivol_series"]:
                                v = float(item.get("value"))
                                matched = None
                                for dv in vals_unique:
                                    if abs(v - dv) <= 1e-4:
                                        matched = dv
                                        break
                                if matched is None:
                                    continue
                                key = (item.get("label"), matched)
                                if key not in seen:
                                    seen.add(key)
                                    dedup_series.append({"label": item.get("label"), "value": matched})
                            result["ctdivol_series"] = dedup_series
                    except Exception:
                        pass
            # Compute CTDIvol average using ONLY SR values
            if sr_values_for_avg:
                sr_vals_unique = self._dedupe_values(sr_values_for_avg, tol=1e-4)
                if sr_vals_unique:
                    result["ctdivol_average_mgy"] = sum(sr_vals_unique) / len(sr_vals_unique)
                    if result["extraction_status"] == "FAILED":
                        result["extraction_status"] = "SUCCESS"
                        if not result.get("extraction_notes"):
                            result["extraction_notes"] = "Computed CTDIvol average from Structured Report"

            if result["extraction_status"] == "FAILED" and not result["ctdivol_values"]:
                result["extraction_notes"] = "No dose information found in any series"

        except Exception as e:
            logger.error(f"Error extracting dose from study {study_instance_uid}: {str(e)}")
            result["extraction_notes"] = f"Extraction error: {str(e)}"

        return result

    def _find_study_by_uid(self, study_instance_uid: str) -> Optional[str]:
        """Find Orthanc study ID by StudyInstanceUID"""
        try:
            query = {"Level": "Study", "Query": {"StudyInstanceUID": study_instance_uid}}
            result = self.client._post_json("tools/find", query)
            if result:
                ids: List[str] = []
                if isinstance(result, dict):
                    ids = result.get("value") or result.get("Results") or []
                elif isinstance(result, list):
                    ids = result
                if ids:
                    return ids[0]

            # Fallback: iterate through studies to match StudyInstanceUID
            study_ids = self.client.get_studies(limit=500)
            for sid in study_ids:
                info = self.client.get_study_info(sid)
                if not info:
                    continue
                uid = info.get("MainDicomTags", {}).get("StudyInstanceUID")
                if uid and uid == study_instance_uid:
                    return sid
        except Exception as e:
            logger.error(f"Error finding study {study_instance_uid}: {str(e)}")
        return None

    def _extract_from_structured_report(self, study_id: str) -> Dict[str, Any]:
        """Extract dose information from Structured Report series"""
        result: Dict[str, Any] = {"success": False, "data": {}}
        try:
            dose_series = self.client.find_dose_report_series(study_id)
            for series_id in dose_series:
                instances = self.client.get_series_instances(series_id)
                for instance_id in instances:
                    tags = self.client.get_instance_tags(instance_id)
                    if not tags:
                        continue
                    data = self._parse_structured_report(tags)
                    if data.get("ctdivol_mgy") is not None or data.get("total_dlp_mgycm") is not None:
                        result["success"] = True
                        result["data"] = data
                        return result
        except Exception as e:
            logger.error(f"Error extracting from SR: {str(e)}")
        return result

    def _extract_from_localizer(self, study_id: str) -> Dict[str, Any]:
        """Extract dose information from Localizer/Topogram series"""
        result: Dict[str, Any] = {"success": False, "data": {}}
        try:
            localizer_series = self.client.find_localizer_series(study_id)
            values: List[float] = []
            equipment_data: Dict[str, Any] = {}
            for series_id in localizer_series:
                instances = self.client.get_series_instances(series_id)
                for instance_id in instances:
                    tags = self.client.get_instance_tags(instance_id)
                    if not tags:
                        continue
                    data = self._parse_localizer_tags(tags)
                    if data.get("ctdivol_mgy") is not None:
                        values.append(data["ctdivol_mgy"])
                    if not equipment_data:
                        equipment_data = {k: data.get(k) for k in ["manufacturer", "station_name"]}
            if values:
                result["success"] = True
                result["data"] = {
                    "ctdivol_mgy": values[0],
                    "ctdivol_values": values,
                    **{k: v for k, v in equipment_data.items() if v is not None},
                }
                return result
        except Exception as e:
            logger.error(f"Error extracting from localizer: {str(e)}")
        return result

    def _extract_from_ct_series(self, study_id: str) -> Dict[str, Any]:
        """Extract basic information from CT series"""
        result: Dict[str, Any] = {"success": False, "data": {}}
        try:
            series_ids = self.client.get_study_series(study_id)
            for series_id in series_ids:
                series_info = self.client.get_series_info(series_id)
                if not series_info:
                    continue
                main_tags = series_info.get("MainDicomTags", {})
                if main_tags.get("Modality") == "CT":
                    instances = self.client.get_series_instances(series_id)
                    if instances:
                        tags = self.client.get_instance_tags(instances[0])
                        if tags:
                            equipment_data = self._parse_equipment_tags(tags)
                            dose_data = self._parse_ct_instance_dose(tags)
                            merged = {**equipment_data, **dose_data}
                            if any(merged.get(k) is not None for k in ["manufacturer", "station_name", "ctdivol_mgy", "total_dlp_mgycm"]):
                                result["success"] = True
                                result["data"] = merged
                                return result
        except Exception as e:
            logger.error(f"Error extracting from CT series: {str(e)}")
        return result

    def _parse_structured_report(self, tags: Dict) -> Dict[str, Any]:
        """Parse Structured Report tags to extract dose information"""
        dose_data: Dict[str, Any] = {
            "ctdivol_mgy": None,
            "ctdivol_values": [],
            "total_dlp_mgycm": None,
            "manufacturer": None,
            "station_name": None,
        }

        try:
            # Helpers for Orthanc JSON structure
            def get_value(node: Dict, tag: str):
                try:
                    key = tag if tag in node else tag.lower()
                    v = node.get(key, {}).get("Value")
                    if isinstance(v, list):
                        return v[0] if v else None
                    return v
                except Exception:
                    return None

            def get_sequence_items(node: Dict, tag: str):
                key = tag if tag in node else tag.lower()
                seq = node.get(key, {})
                if isinstance(seq, dict) and seq.get("Type") == "Sequence":
                    return seq.get("Value", [])
                return []

            def collect_sr_values(node: Dict, target_code: str, out: List[float]) -> None:
                # Concept Name Code Sequence (0040,A043) -> Code Value (0008,0100)
                for concept_item in get_sequence_items(node, "0040,A043"):
                    code_val = get_value(concept_item, "0008,0100")
                    if code_val and str(code_val) == target_code:
                        # Measured Value Sequence (0040,A300) -> Numeric Value (0040,A30A)
                        for mv_item in get_sequence_items(node, "0040,A300"):
                            num = get_value(mv_item, "0040,A30A")
                            if num is not None:
                                try:
                                    out.append(float(num))
                                except Exception:
                                    pass
                for child in get_sequence_items(node, "0040,A730"):
                    collect_sr_values(child, target_code, out)

            def search_sr_single_value(node: Dict, target_code: str) -> Optional[float]:
                vals: List[float] = []
                collect_sr_values(node, target_code, vals)
                return vals[0] if vals else None

            # CTDIvol (code 113830)
            sr_vals: List[float] = []
            collect_sr_values(tags, "113830", sr_vals)
            if sr_vals:
                dose_data["ctdivol_values"] = sr_vals
                dose_data["ctdivol_mgy"] = sr_vals[0]

            # Total DLP (code 113813)
            dlp_total = search_sr_single_value(tags, "113813")
            if dlp_total is not None:
                dose_data["total_dlp_mgycm"] = dlp_total

            # Fallback: CTDIvol directly in instance (0018,9345)
            key = "0018,9345" if "0018,9345" in tags else "0018,9345".lower()
            if key in tags:
                ctdivol_value = tags[key].get("Value")
                if ctdivol_value is not None:
                    try:
                        val = ctdivol_value[0] if isinstance(ctdivol_value, list) else ctdivol_value
                        fval = float(val)
                        if dose_data["ctdivol_mgy"] is None:
                            dose_data["ctdivol_mgy"] = fval
                        dose_data.setdefault("ctdivol_values", []).append(fval)
                    except Exception:
                        pass

            def walk_collect_ctdivol(node: Any, out: List[float]):
                try:
                    if isinstance(node, dict):
                        for k, v in node.items():
                            kk = k.lower()
                            if kk == "0018,9345":
                                val = v.get("Value")
                                if val is not None:
                                    try:
                                        x = val[0] if isinstance(val, list) else val
                                        out.append(float(x))
                                    except Exception:
                                        pass
                            elif isinstance(v, dict):
                                t = v.get("Type")
                                if t == "Sequence":
                                    items = v.get("Value") or []
                                    for it in items:
                                        walk_collect_ctdivol(it, out)
                            else:
                                walk_collect_ctdivol(v, out)
                    elif isinstance(node, list):
                        for it in node:
                            walk_collect_ctdivol(it, out)
                except Exception:
                    pass

            extra_vals: List[float] = []
            walk_collect_ctdivol(tags, extra_vals)
            if extra_vals:
                for f in extra_vals:
                    dose_data.setdefault("ctdivol_values", []).append(f)
                if dose_data["ctdivol_mgy"] is None:
                    dose_data["ctdivol_mgy"] = extra_vals[0]

            def parse_dlp_from_comments(node: Dict) -> Optional[float]:
                try:
                    key = "0040,0310" if "0040,0310" in node else "0040,0310".lower()
                    cm = node.get(key)
                    if isinstance(cm, dict):
                        val = cm.get("Value")
                        txt = val[0] if isinstance(val, list) and val else val
                        if isinstance(txt, str):
                            import re
                            m = re.search(r"TotalDLP\s*=\s*([0-9]+(?:\.[0-9]+)?)", txt)
                            if m:
                                return float(m.group(1))
                except Exception:
                    pass
                return None

            if dose_data["total_dlp_mgycm"] is None:
                dlp_from_comments = parse_dlp_from_comments(tags)
                if dlp_from_comments is not None:
                    dose_data["total_dlp_mgycm"] = dlp_from_comments

            # Equipment
            equipment_data = self._parse_equipment_tags(tags)
            dose_data.update(equipment_data)

        except Exception as e:
            logger.error(f"Error parsing SR tags: {str(e)}")

        return dose_data

    def _parse_ct_instance_dose(self, tags: Dict) -> Dict[str, Any]:
        dose_data: Dict[str, Any] = {"ctdivol_mgy": None, "ctdivol_values": [], "total_dlp_mgycm": None}
        try:
            def walk_collect_ctdivol(node: Any, out: List[float]):
                try:
                    if isinstance(node, dict):
                        for k, v in node.items():
                            kk = k.lower()
                            if kk == "0018,9345":
                                val = v.get("Value")
                                if val is not None:
                                    try:
                                        x = val[0] if isinstance(val, list) else val
                                        out.append(float(x))
                                    except Exception:
                                        pass
                            elif isinstance(v, dict) and v.get("Type") == "Sequence":
                                items = v.get("Value") or []
                                for it in items:
                                    walk_collect_ctdivol(it, out)
                            else:
                                walk_collect_ctdivol(v, out)
                    elif isinstance(node, list):
                        for it in node:
                            walk_collect_ctdivol(it, out)
                except Exception:
                    pass

            vals: List[float] = []
            walk_collect_ctdivol(tags, vals)
            if vals:
                dose_data["ctdivol_values"] = vals
                dose_data["ctdivol_mgy"] = vals[0]

            try:
                key = "0040,0310" if "0040,0310" in tags else "0040,0310".lower()
                cm = tags.get(key)
                if isinstance(cm, dict):
                    val = cm.get("Value")
                    txt = val[0] if isinstance(val, list) and val else val
                    if isinstance(txt, str):
                        import re
                        m = re.search(r"TotalDLP\s*=\s*([0-9]+(?:\.[0-9]+)?)", txt)
                        if m:
                            dose_data["total_dlp_mgycm"] = float(m.group(1))
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Error parsing CT instance dose: {str(e)}")
        return dose_data

    def _parse_localizer_tags(self, tags: Dict) -> Dict[str, Any]:
        """Parse localizer/topogram tags to extract dose information"""
        dose_data: Dict[str, Any] = {
            "ctdivol_mgy": None,
            "total_dlp_mgycm": None,
            "manufacturer": None,
            "station_name": None,
        }

        try:
            def get_val(node: Dict, tag: str):
                key = tag if tag in node else tag.lower()
                v = node.get(key, {}).get("Value")
                if isinstance(v, list):
                    return v[0] if v else None
                return v

            # ImageType (0008,0008) contains LOCALIZER/TOPOGRAM/SCOUT
            img = tags.get("0008,0008") or tags.get("0008,0008".lower())
            vals: List[str] = []
            if isinstance(img, dict):
                v = img.get("Value")
                if isinstance(v, list):
                    vals = [str(x) for x in v]
                elif v is not None:
                    vals = [str(v)]
            if not any(s.upper().find("LOCALIZER") >= 0 or s.upper().find("TOPOGRAM") >= 0 or s.upper().find("SCOUT") >= 0 for s in vals):
                return dose_data

            # CTDIvol (0018,9345)
            v = get_val(tags, "0018,9345")
            if v is not None:
                try:
                    dose_data["ctdivol_mgy"] = float(v)
                except Exception:
                    pass

            # Equipment
            equipment_data = self._parse_equipment_tags(tags)
            dose_data.update(equipment_data)

        except Exception as e:
            logger.error(f"Error parsing localizer tags: {str(e)}")

        return dose_data

    def _parse_equipment_tags(self, tags: Dict) -> Dict[str, Any]:
        """Parse equipment-related tags"""
        equipment_data: Dict[str, Any] = {"manufacturer": None, "station_name": None}
        try:
            # Manufacturer (0008,0070)
            if "0008,0070" in tags:
                manufacturer_value = tags["0008,0070"].get("Value")
                if manufacturer_value:
                    equipment_data["manufacturer"] = str(manufacturer_value[0]) if isinstance(manufacturer_value, list) else str(manufacturer_value)

            # Station Name (0008,1010)
            if "0008,1010" in tags:
                station_value = tags["0008,1010"].get("Value")
                if station_value:
                    equipment_data["station_name"] = str(station_value[0]) if isinstance(station_value, list) else str(station_value)

        except Exception as e:
            logger.error(f"Error parsing equipment tags: {str(e)}")

        return equipment_data

    def _dedupe_values(self, values: List[float], tol: float = 1e-6) -> List[float]:
        """Deduplicate float values within tolerance, preserving insertion order."""
        deduped: List[float] = []
        for v in values:
            try:
                f = float(v)
            except Exception:
                continue
            if not any(abs(f - dv) <= tol for dv in deduped):
                deduped.append(f)
        return deduped


# Global instance
dose_extractor = DoseExtractor()
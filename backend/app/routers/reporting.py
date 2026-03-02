from fastapi import APIRouter, HTTPException, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional, List
import io
import logging
from datetime import datetime, date
import xlsxwriter

from app.schemas import ReportingDataResponse, DoseRecordResponse
from app.database import get_db
from app.models import DoseRecord

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/reporting-data", response_model=ReportingDataResponse)
async def get_reporting_data(
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum number of records to return"),
    offset: int = Query(default=0, ge=0, description="Number of records to skip"),
    start_date: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    patient_id: Optional[str] = Query(default=None, description="Filter by patient ID"),
    manufacturer: Optional[str] = Query(default=None, description="Filter by manufacturer"),
    extraction_status: Optional[str] = Query(default=None, description="Filter by extraction status")
):
    """
    Get dose records from database with optional filtering
    
    - **limit**: Maximum number of records to return (1-1000)
    - **offset**: Number of records to skip for pagination
    - **start_date**: Filter records from this date (YYYY-MM-DD)
    - **end_date**: Filter records until this date (YYYY-MM-DD)
    - **patient_id**: Filter by specific patient ID
    - **manufacturer**: Filter by equipment manufacturer
    - **extraction_status**: Filter by extraction status (SUCCESS, PARTIAL, FAILED)
    """
    try:
        # Build query with filters
        query = db.query(DoseRecord)
        
        # Apply filters
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                query = query.filter(DoseRecord.created_at >= start_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
        
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                query = query.filter(DoseRecord.created_at <= end_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
        
        if patient_id:
            query = query.filter(DoseRecord.patient_id.ilike(f"%{patient_id}%"))
        
        if manufacturer:
            query = query.filter(DoseRecord.manufacturer.ilike(f"%{manufacturer}%"))
        
        if extraction_status:
            query = query.filter(DoseRecord.extraction_status == extraction_status)
        
        # Get total count
        total_count = query.count()
        
        # Apply pagination and ordering
        records = query.order_by(DoseRecord.created_at.desc()).offset(offset).limit(limit).all()
        
        # Calculate summary statistics
        summary_query = db.query(
            func.count(DoseRecord.id).label('total_records'),
            func.avg(DoseRecord.ctdivol_mgy).label('avg_ctdivol'),
            func.avg(DoseRecord.total_dlp_mgycm).label('avg_dlp'),
            func.min(DoseRecord.ctdivol_mgy).label('min_ctdivol'),
            func.max(DoseRecord.ctdivol_mgy).label('max_ctdivol'),
            func.min(DoseRecord.total_dlp_mgycm).label('min_dlp'),
            func.max(DoseRecord.total_dlp_mgycm).label('max_dlp')
        ).filter(
            and_(
                DoseRecord.ctdivol_mgy.isnot(None),
                DoseRecord.total_dlp_mgycm.isnot(None)
            )
        )
        
        # Apply same filters to summary
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            summary_query = summary_query.filter(DoseRecord.created_at >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            summary_query = summary_query.filter(DoseRecord.created_at <= end_dt)
        
        if patient_id:
            summary_query = summary_query.filter(DoseRecord.patient_id.ilike(f"%{patient_id}%"))
        
        if manufacturer:
            summary_query = summary_query.filter(DoseRecord.manufacturer.ilike(f"%{manufacturer}%"))
        
        if extraction_status:
            summary_query = summary_query.filter(DoseRecord.extraction_status == extraction_status)
        
        summary_result = summary_query.first()
        
        # Build summary dict
        summary = {
            "total_records": summary_result.total_records or 0,
            "avg_ctdivol_mgy": round(summary_result.avg_ctdivol, 2) if summary_result.avg_ctdivol else None,
            "avg_dlp_mgycm": round(summary_result.avg_dlp, 2) if summary_result.avg_dlp else None,
            "min_ctdivol_mgy": summary_result.min_ctdivol,
            "max_ctdivol_mgy": summary_result.max_ctdivol,
            "min_dlp_mgycm": summary_result.min_dlp,
            "max_dlp_mgycm": summary_result.max_dlp
        }
        
        # Convert to response models
        record_responses = [DoseRecordResponse.from_orm(record) for record in records]
        
        return ReportingDataResponse(
            records=record_responses,
            total_count=total_count,
            summary=summary
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching reporting data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching reporting data: {str(e)}"
        )

@router.get("/export/excel")
async def export_excel(
    db: Session = Depends(get_db),
    start_date: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    patient_id: Optional[str] = Query(default=None, description="Filter by patient ID"),
    manufacturer: Optional[str] = Query(default=None, description="Filter by manufacturer"),
    extraction_status: Optional[str] = Query(default=None, description="Filter by extraction status")
):
    """
    Export dose records to Excel file
    
    - **start_date**: Filter records from this date (YYYY-MM-DD)
    - **end_date**: Filter records until this date (YYYY-MM-DD)
    - **patient_id**: Filter by specific patient ID
    - **manufacturer**: Filter by equipment manufacturer
    - **extraction_status**: Filter by extraction status (SUCCESS, PARTIAL, FAILED)
    """
    try:
        # Build query with same filters as reporting-data
        query = db.query(DoseRecord)
        
        # Apply filters
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                query = query.filter(DoseRecord.created_at >= start_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
        
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                query = query.filter(DoseRecord.created_at <= end_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
        
        if patient_id:
            query = query.filter(DoseRecord.patient_id.ilike(f"%{patient_id}%"))
        
        if manufacturer:
            query = query.filter(DoseRecord.manufacturer.ilike(f"%{manufacturer}%"))
        
        if extraction_status:
            query = query.filter(DoseRecord.extraction_status == extraction_status)
        
        # Get all records (no pagination for export)
        records = query.order_by(DoseRecord.created_at.desc()).all()
        
        if not records:
            raise HTTPException(status_code=404, detail="No records found for export")
        
        # Prepare data rows
        headers = [
            'No',
            'Tanggal Pemeriksaan\nDD/MM/YYYY',
            'Kode Pasien\n(Jika Ada)',
            'Nama Pasien\n(Jika Ada)',
            'Jenis Kelamin',
            'Usia\n(tahun)',
            'Berat Badan\n(kg)',
            'Jenis Pemeriksaan',
            'Kontras/\nNon Kontras',
            'Jumlah Sequence\n[ 1/2/3/>=4 ]',
            'CTDIvol rata-rata\n(mGy)',
            'DLP Total\n(mGy.cm)'
        ]
        rows = []
        for idx, record in enumerate(records, start=1):
            # Date formatting DD/MM/YYYY
            def fmt_date(d):
                try:
                    if not d:
                        return ''
                    if isinstance(d, str) and len(d) == 8 and d.isdigit():
                        # DICOM StudyDate like YYYYMMDD
                        return f"{d[6:8]}/{d[4:6]}/{d[0:4]}"
                    # fallback: try parse
                    dt = datetime.strptime(str(d), '%Y-%m-%d')
                    return dt.strftime('%d/%m/%Y')
                except Exception:
                    return str(d)

            tanggal = fmt_date(record.study_date)
            kontras_text = 'Kontras' if record.contrast_used else 'Non Kontras'
            avg_ctdivol = record.ctdivol_average_mgy if record.ctdivol_average_mgy is not None else record.ctdivol_mgy

            rows.append([
                idx,
                tanggal,
                record.patient_id,
                record.patient_name,
                record.patient_sex,
                record.patient_age_years,
                record.patient_weight_kg,
                (record.idrl_category or record.exam_type),
                kontras_text,
                record.sequence_count,
                avg_ctdivol,
                record.total_dlp_mgycm
            ])

        # Create Excel file in memory using xlsxwriter
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        ws_data = workbook.add_worksheet('Dose Records')

        # Define formats for clean, readable export (like the provided example)
        header_fmt = workbook.add_format({
            'bold': True,
            'align': 'center',
            'valign': 'vcenter',
            'bg_color': '#D9E1F2',  # light blue-gray header
            'border': 1,
            'text_wrap': True  # Enable text wrapping for multiline headers
        })
        center_fmt = workbook.add_format({'align': 'center', 'border': 1})
        left_fmt = workbook.add_format({'align': 'left', 'border': 1})
        num_fmt_0 = workbook.add_format({'align': 'center', 'border': 1, 'num_format': '0'})
        num_fmt_1 = workbook.add_format({'align': 'center', 'border': 1, 'num_format': '0.0'})
        num_fmt_2 = workbook.add_format({'align': 'center', 'border': 1, 'num_format': '0.00'})
        date_fmt = workbook.add_format({'align': 'center', 'border': 1})

        # Column widths tuned for readability
        col_widths = [
            5,   # No
            18,  # Tanggal Pemeriksaan
            16,  # Kode Pasien
            28,  # Nama Pasien
            12,  # Jenis Kelamin
            10,  # Usia
            12,  # Berat Badan
            20,  # Jenis Pemeriksaan
            16,  # Kontras/Non Kontras
            18,  # Jumlah Sequence
            18,  # CTDIvol rata-rata
            18,  # DLP Total
        ]
        for idx, w in enumerate(col_widths):
            # Apply a default cell format (left/center choice will be per-cell below)
            ws_data.set_column(idx, idx, w)

        # Freeze header row and enable autofilter
        ws_data.freeze_panes(1, 0)
        ws_data.autofilter(0, 0, len(rows), len(headers) - 1)

        # Write headers with header format
        ws_data.set_row(0, 40)  # Increase header row height for wrapped text
        for col, h in enumerate(headers):
            ws_data.write(0, col, h, header_fmt)

        # Helper to select cell format per column
        def fmt_for_col(col_index: int):
            # Map columns based on new headers order
            if col_index == 0:  # No
                return center_fmt
            if col_index == 1:  # Tanggal
                return date_fmt
            if col_index in [2, 3, 7]:  # Kode, Nama, Jenis Pemeriksaan
                return left_fmt
            if col_index == 4:  # Jenis Kelamin
                return center_fmt
            if col_index == 5:  # Usia
                return num_fmt_0
            if col_index == 6:  # Berat Badan
                return num_fmt_1
            if col_index == 8:  # Kontras
                return center_fmt
            if col_index == 9:  # Jumlah Sequence
                return num_fmt_0
            if col_index in [10, 11]:  # CTDIvol, DLP
                return num_fmt_2
            return left_fmt

        # Write rows with formatting
        for row_idx, row in enumerate(rows, start=1):
            for col_idx, val in enumerate(row):
                fmt = fmt_for_col(col_idx)
                # Ensure None becomes blank, keep numeric types as-is for number formats
                ws_data.write(row_idx, col_idx, ('' if val is None else val), fmt)

        # Summary sheet
        ws_summary = workbook.add_worksheet('Summary')
        # Columns indexes updated due to new headers (CTDIvol is at index 10, DLP at 11)
        ctdivols = [r[10] for r in rows if r[10] is not None]
        dlps = [r[11] for r in rows if r[11] is not None]
        summary_items = [
            ('Total Records', len(rows)),
            ('Records with CTDIvol', len(ctdivols)),
            ('Records with DLP', len(dlps)),
            ('Average CTDIvol (mGy)', round(sum(ctdivols) / len(ctdivols), 2) if ctdivols else 'N/A'),
            ('Average DLP (mGy*cm)', round(sum(dlps) / len(dlps), 2) if dlps else 'N/A'),
            ('Min CTDIvol (mGy)', min(ctdivols) if ctdivols else 'N/A'),
            ('Max CTDIvol (mGy)', max(ctdivols) if ctdivols else 'N/A'),
            ('Min DLP (mGy*cm)', min(dlps) if dlps else 'N/A'),
            ('Max DLP (mGy*cm)', max(dlps) if dlps else 'N/A'),
        ]
        # Format summary sheet
        sum_header_fmt = workbook.add_format({'bold': True, 'bg_color': '#E2EFDA', 'border': 1})
        sum_cell_fmt = workbook.add_format({'border': 1})
        ws_summary.set_column(0, 0, 28)
        ws_summary.set_column(1, 1, 18)
        ws_summary.write(0, 0, 'Metric', sum_header_fmt)
        ws_summary.write(0, 1, 'Value', sum_header_fmt)
        for idx, (metric, value) in enumerate(summary_items, start=1):
            ws_summary.write(idx, 0, metric, sum_cell_fmt)
            ws_summary.write(idx, 1, value, sum_cell_fmt)

        workbook.close()
        output.seek(0)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%d%m%Y-%H%M")
        filename = f"dose-{timestamp}.xlsx"
        
        # Return Excel file
        return Response(
            content=output.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting to Excel: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error exporting to Excel: {str(e)}"
        )

@router.get("/statistics")
async def get_statistics(
    db: Session = Depends(get_db),
    start_date: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)")
):
    """
    Get detailed statistics about dose records
    """
    try:
        # Base query
        query = db.query(DoseRecord)
        
        # Apply date filters
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(DoseRecord.created_at >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            query = query.filter(DoseRecord.created_at <= end_dt)
        
        # Get statistics by manufacturer
        manufacturer_stats = db.query(
            DoseRecord.manufacturer,
            func.count(DoseRecord.id).label('count'),
            func.avg(DoseRecord.ctdivol_mgy).label('avg_ctdivol'),
            func.avg(DoseRecord.total_dlp_mgycm).label('avg_dlp')
        ).filter(
            DoseRecord.manufacturer.isnot(None)
        ).group_by(DoseRecord.manufacturer).all()
        
        # Get statistics by extraction status
        status_stats = db.query(
            DoseRecord.extraction_status,
            func.count(DoseRecord.id).label('count')
        ).group_by(DoseRecord.extraction_status).all()
        
        # Get statistics by extraction method
        method_stats = db.query(
            DoseRecord.extraction_method,
            func.count(DoseRecord.id).label('count')
        ).filter(
            DoseRecord.extraction_method.isnot(None)
        ).group_by(DoseRecord.extraction_method).all()
        
        return {
            "manufacturer_statistics": [
                {
                    "manufacturer": stat.manufacturer,
                    "count": stat.count,
                    "avg_ctdivol_mgy": round(stat.avg_ctdivol, 2) if stat.avg_ctdivol else None,
                    "avg_dlp_mgycm": round(stat.avg_dlp, 2) if stat.avg_dlp else None
                }
                for stat in manufacturer_stats
            ],
            "extraction_status_statistics": [
                {
                    "status": stat.extraction_status,
                    "count": stat.count
                }
                for stat in status_stats
            ],
            "extraction_method_statistics": [
                {
                    "method": stat.extraction_method,
                    "count": stat.count
                }
                for stat in method_stats
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching statistics: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching statistics: {str(e)}"
        )

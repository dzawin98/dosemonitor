from fastapi import APIRouter, HTTPException, Depends, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import IDRLNationalThreshold
from app.schemas import IDRLNationalCreate, IDRLNationalUpdate, IDRLNationalResponse
from app.routers.auth import _require_admin

router = APIRouter()

@router.get("/idrl-national", response_model=List[IDRLNationalResponse])
async def list_idrl_national(
    year: Optional[int] = Query(default=None),
    active: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db)
):
    q = db.query(IDRLNationalThreshold)
    if year is not None:
        q = q.filter(IDRLNationalThreshold.year == year)
    if active is not None:
        q = q.filter(IDRLNationalThreshold.active == active)
    rows = q.order_by(IDRLNationalThreshold.category_key.asc(), IDRLNationalThreshold.age_group.asc()).all()
    return [IDRLNationalResponse.model_validate(r) for r in rows]

@router.post("/idrl-national", response_model=IDRLNationalResponse)
async def create_idrl_national(body: IDRLNationalCreate, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    row = IDRLNationalThreshold(
        category_key=body.category_key,
        contrast=body.contrast,
        age_group=body.age_group,
        year=body.year,
        ctdi_limit_mgy=body.ctdi_limit_mgy,
        dlp_limit_mgycm=body.dlp_limit_mgycm,
        active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return IDRLNationalResponse.model_validate(row)

@router.put("/idrl-national/{id}", response_model=IDRLNationalResponse)
async def update_idrl_national(id: int, body: IDRLNationalUpdate, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    row = db.query(IDRLNationalThreshold).filter(IDRLNationalThreshold.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="IDRL record not found")
    for field, value in body.dict(exclude_none=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return IDRLNationalResponse.model_validate(row)

@router.delete("/idrl-national/{id}")
async def delete_idrl_national(id: int, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    row = db.query(IDRLNationalThreshold).filter(IDRLNationalThreshold.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="IDRL record not found")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": id}


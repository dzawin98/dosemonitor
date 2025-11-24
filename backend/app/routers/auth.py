from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, LoginResponse, UserCreateRequest, UserResponse, UsersListResponse, UserUpdateRequest
from app.auth import hash_password, verify_password, create_token, verify_token

router = APIRouter()


def _auth_header_to_payload(request: Request) -> dict | None:
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    return verify_token(token)


def _require_user(request: Request, db: Session) -> User:
    payload = _auth_header_to_payload(request)
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized")
    username = payload.get("sub")
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def _require_admin(request: Request, db: Session) -> User:
    user = _require_user(request, db)
    if (user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@router.post("/login", response_model=LoginResponse)
async def login(request_body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request_body.username).first()
    if not user or not verify_password(request_body.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": user.username, "role": user.role})
    return LoginResponse(token=token, username=user.username, role=user.role)


@router.post("/users", response_model=UserResponse)
async def create_user(body: UserCreateRequest, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    ph = hash_password(body.password)
    user = User(username=body.username, password_hash=ph, role=(body.role or "user"), is_active=bool(body.is_active))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user, from_attributes=True)


@router.get("/users", response_model=UsersListResponse)
async def list_users(request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    users = db.query(User).order_by(User.id.asc()).all()
    return UsersListResponse(users=[UserResponse.model_validate(u, from_attributes=True) for u in users])


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, body: UserUpdateRequest, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.password:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = bool(body.is_active)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user, from_attributes=True)


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    _require_admin(request, db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}
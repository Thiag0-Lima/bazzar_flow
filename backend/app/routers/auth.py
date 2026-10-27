from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..auth import authenticate_user, create_access_token, get_password_hash, get_current_user, require_roles
from ..models import User, UserRole
from ..schemas import Token, UserCreate, UserOut, UserRoleUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")
    token = create_access_token(data={"sub": user.username, "role": user.role.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut.model_validate(user)
    }

@router.post("/register", response_model=UserOut)
def register(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN))
):
    username = user_in.username.strip().lower()

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Usuário já existe")

    user = User(
        username=username,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name.strip(),
        role=user_in.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current

@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN))
):
    return db.query(User).order_by(User.id).all()

@router.patch("/users/{user_id}/toggle", response_model=UserOut)
def toggle_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if user.id == current.id:
        raise HTTPException(400, "Você não pode desativar a si mesmo")
    
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if user.id == current.id and body.role != UserRole.ADMIN:
        raise HTTPException(400, "Você não pode remover o próprio perfil de admin")

    user.role = body.role
    db.commit()
    db.refresh(user)
    return user


# RESET DE SENHAS

from pydantic import BaseModel

class PasswordReset(BaseModel):
    new_password: str

@router.patch("/users/{user_id}/password", response_model=UserOut)
def reset_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN))
):
    if len(body.new_password) < 3:
        raise HTTPException(400, "A senha deve ter pelo menos 3 caracteres")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")

    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    db.refresh(user)
    return user
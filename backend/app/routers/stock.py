from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    User, UserRole, StockCategory, StockItem, StockMovement, StockRequest
)
from ..schemas import (
    CategoryCreate, CategoryOut,
    StockItemCreate, StockItemUpdate, StockItemOut,
    StockAdjust, StockMovementOut,
    StockRequestCreate, StockRequestDecide, StockRequestOut, CategoryUpdate
)
from ..auth import get_current_user, require_roles
from ..timezone_utils import now_br

from pydantic import BaseModel



router = APIRouter(prefix="/api/stock", tags=["stock"])


def _can_manage(user: User) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.ESTOQUE)

def calc_stock_status(quantidade: float, minimo: float) -> str:
    q = float(quantidade)
    x = float(minimo)

    if q <= 0:
        return "zerado"
    if q < x and q <= 1:
        return "urgente"
    if q < x and q > 1:
        return "baixo"
    if x <= q <= (x + 1):
        return "atencao"
    # q >= x + 2
    return "ok"


def _item_out(item: StockItem, db: Session) -> StockItemOut:
    cat = db.query(StockCategory).filter(StockCategory.id == item.categoria_id).first()
    data = StockItemOut.model_validate(item)
    data.categoria_nome = cat.nome if cat else None
    data.status = calc_stock_status(item.quantidade, item.minimo)
    data.baixo = data.status in ("zerado", "urgente", "baixo")
    return data


def _req_out(req: StockRequest, db: Session) -> StockRequestOut:
    item = db.query(StockItem).filter(StockItem.id == req.item_id).first()
    sol = db.query(User).filter(User.id == req.solicitado_por).first()
    dec = db.query(User).filter(User.id == req.decidido_por).first() if req.decidido_por else None
    return StockRequestOut(
        id=req.id,
        item_id=req.item_id,
        item_nome=item.nome if item else None,
        quantidade=req.quantidade,
        motivo=req.motivo,
        status=req.status,
        solicitado_por=req.solicitado_por,
        solicitante_nome=sol.full_name if sol else None,
        decidido_por=req.decidido_por,
        decisor_nome=dec.full_name if dec else None,
        decisao_motivo=req.decisao_motivo,
        created_at=req.created_at,
        decided_at=req.decided_at,
    )


# ----- Categorias -----
@router.get("/categories", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return db.query(StockCategory).order_by(StockCategory.nome).all()


@router.post("/categories", response_model=CategoryOut)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, "Nome obrigatório")

    existente = db.query(StockCategory).filter(StockCategory.nome == nome).first()
    if existente:
        if existente.ativo:
            raise HTTPException(400, "Categoria já existe")
        existente.ativo = True
        db.commit()
        db.refresh(existente)
        return existente

    cat = StockCategory(nome=nome)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

@router.post("/categories/{cat_id}/reactivate", response_model=CategoryOut)
def reactivate_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    cat = db.query(StockCategory).filter(StockCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    cat.ativo = True
    db.commit()
    db.refresh(cat)
    return cat

# ----- Categorias Update -----

@router.patch("/categories/{cat_id}", response_model=CategoryOut)
def update_category(
    cat_id: int,
    body: CategoryUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    cat = db.query(StockCategory).filter(StockCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    if body.nome is not None:
        nome = body.nome.strip()
        if not nome:
            raise HTTPException(400, "Nome obrigatório")
        exists = db.query(StockCategory).filter(
            StockCategory.nome == nome, StockCategory.id != cat_id
        ).first()
        if exists:
            raise HTTPException(400, "Já existe categoria com este nome")
        cat.nome = nome
    if body.ativo is not None:
        cat.ativo = body.ativo
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}")
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    cat = db.query(StockCategory).filter(StockCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    em_uso = db.query(StockItem).filter(StockItem.categoria_id == cat_id).count()
    if em_uso:
        # exclusão lógica
        cat.ativo = False
        db.commit()
        return {"ok": True, "message": "Categoria desativada (há itens vinculados)"}
    db.delete(cat)
    db.commit()
    return {"ok": True, "message": "Categoria excluída"}

# ----- Itens -----
@router.get("/items", response_model=List[StockItemOut])
def list_items(
    q: Optional[str] = None,
    categoria_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(StockItem).filter(StockItem.ativo == True)
    if categoria_id:
        query = query.filter(StockItem.categoria_id == categoria_id)
    if q:
        query = query.filter(StockItem.nome.ilike(f"%{q}%"))
    items = query.order_by(StockItem.nome).all()
    return [_item_out(i, db) for i in items]


@router.post("/items", response_model=StockItemOut)
def create_item(
    body: StockItemCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    if not db.query(StockCategory).filter(StockCategory.id == body.categoria_id).first():
        raise HTTPException(400, "Categoria inválida")
    item = StockItem(**body.model_dump())
    db.add(item)
    db.flush()
    # movimento inicial
    db.add(StockMovement(
        item_id=item.id,
        tipo="entrada",
        qtd_anterior=0,
        qtd_nova=item.quantidade,
        qtd_delta=item.quantidade,
        motivo="Cadastro inicial",
        user_id=current.id,
    ))
    db.commit()
    db.refresh(item)
    return _item_out(item, db)


@router.patch("/items/{item_id}", response_model=StockItemOut)
def update_item(
    item_id: int,
    body: StockItemUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _item_out(item, db)


@router.post("/items/{item_id}/adjust", response_model=StockItemOut)
def adjust_item(
    item_id: int,
    body: StockAdjust,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    if body.tipo not in ("entrada", "saida", "inventario"):
        raise HTTPException(400, "Tipo inválido")
    if not body.motivo.strip():
        raise HTTPException(400, "Motivo obrigatório")

    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")

    anterior = float(item.quantidade)
    if body.tipo == "entrada":
        nova = anterior + body.quantidade
    elif body.tipo == "saida":
        if body.quantidade > anterior:
            raise HTTPException(400, "Saldo insuficiente")
        nova = anterior - body.quantidade
    else:  # inventario
        nova = body.quantidade

    item.quantidade = nova
    db.add(StockMovement(
        item_id=item.id,
        tipo=body.tipo,
        qtd_anterior=anterior,
        qtd_nova=nova,
        qtd_delta=nova - anterior,
        motivo=body.motivo.strip(),
        user_id=current.id,
    ))
    db.commit()
    db.refresh(item)
    return _item_out(item, db)


@router.get("/movements", response_model=List[StockMovementOut])
def list_movements(
    item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(StockMovement)
    if item_id:
        query = query.filter(StockMovement.item_id == item_id)
    rows = query.order_by(StockMovement.created_at.desc()).limit(200).all()
    result = []
    for m in rows:
        item = db.query(StockItem).filter(StockItem.id == m.item_id).first()
        user = db.query(User).filter(User.id == m.user_id).first()
        result.append(StockMovementOut(
            id=m.id,
            item_id=m.item_id,
            item_nome=item.nome if item else None,
            tipo=m.tipo,
            qtd_anterior=m.qtd_anterior,
            qtd_nova=m.qtd_nova,
            qtd_delta=m.qtd_delta,
            motivo=m.motivo,
            user_id=m.user_id,
            user_name=user.full_name if user else None,
            created_at=m.created_at,
        ))
    return result


# ----- Itens Delete -----

@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")
    item.ativo = False
    db.commit()
    return {"ok": True, "message": "Item desativado"}

# ----- Solicitações -----
@router.post("/requests", response_model=StockRequestOut)
def create_request(
    body: StockRequestCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if body.quantidade <= 0:
        raise HTTPException(400, "Quantidade inválida")
    if not body.motivo.strip():
        raise HTTPException(400, "Motivo obrigatório")
    item = db.query(StockItem).filter(StockItem.id == body.item_id, StockItem.ativo == True).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")

    req = StockRequest(
        item_id=body.item_id,
        quantidade=body.quantidade,
        motivo=body.motivo.strip(),
        status="pendente",
        solicitado_por=current.id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _req_out(req, db)


@router.get("/requests", response_model=List[StockRequestOut])
def list_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(StockRequest)
    # quem não gerencia só vê as próprias
    if not _can_manage(current):
        query = query.filter(StockRequest.solicitado_por == current.id)
    if status:
        query = query.filter(StockRequest.status == status)
    rows = query.order_by(StockRequest.created_at.desc()).limit(200).all()
    return [_req_out(r, db) for r in rows]


@router.post("/requests/{req_id}/approve", response_model=StockRequestOut)
def approve_request(
    req_id: int,
    body: StockRequestDecide = StockRequestDecide(),
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    req = db.query(StockRequest).filter(StockRequest.id == req_id).first()
    if not req or req.status != "pendente":
        raise HTTPException(400, "Solicitação inválida ou já decidida")

    item = db.query(StockItem).filter(StockItem.id == req.item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")
    if req.quantidade > item.quantidade:
        raise HTTPException(400, f"Saldo insuficiente (disponível: {item.quantidade})")

    anterior = float(item.quantidade)
    nova = anterior - float(req.quantidade)
    item.quantidade = nova

    req.status = "aprovada"
    req.decidido_por = current.id
    req.decisao_motivo = (body.motivo or "").strip() or None
    req.decided_at = now_br()

    db.add(StockMovement(
        item_id=item.id,
        tipo="solicitacao",
        qtd_anterior=anterior,
        qtd_nova=nova,
        qtd_delta=-(req.quantidade),
        motivo=f"Solicitação #{req.id} aprovada: {req.motivo}",
        user_id=current.id,
    ))
    db.commit()
    db.refresh(req)
    return _req_out(req, db)


@router.post("/requests/{req_id}/reject", response_model=StockRequestOut)
def reject_request(
    req_id: int,
    body: StockRequestDecide = StockRequestDecide(),
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.ESTOQUE)),
):
    req = db.query(StockRequest).filter(StockRequest.id == req_id).first()
    if not req or req.status != "pendente":
        raise HTTPException(400, "Solicitação inválida ou já decidida")

    req.status = "negada"
    req.decidido_por = current.id
    req.decisao_motivo = (body.motivo or "").strip() or "Negada"
    req.decided_at = now_br()
    db.commit()
    db.refresh(req)
    return _req_out(req, db)


@router.post("/requests/{req_id}/cancel", response_model=StockRequestOut)
def cancel_request(
    req_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    req = db.query(StockRequest).filter(StockRequest.id == req_id).first()
    if not req or req.status != "pendente":
        raise HTTPException(400, "Solicitação inválida ou já decidida")
    if req.solicitado_por != current.id and not _can_manage(current):
        raise HTTPException(403, "Sem permissão")
    req.status = "cancelada"
    req.decided_at = now_br()
    db.commit()
    db.refresh(req)
    return _req_out(req, db)
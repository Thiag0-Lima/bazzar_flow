import asyncio
from .websocket import manager 
from datetime import datetime, timedelta
from  ..timezone_utils import now_br
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from ..database import get_db
from ..models import Order, StatusLog, OrderStatus, User, UserRole
from ..schemas import OrderCreate, OrderOut, OrderUpdateStatus, OrderDeliver, StatusLogOut
from ..auth import get_current_user, require_roles
from ..services.aging import calculate_aging

router = APIRouter(prefix="/api/orders", tags=["orders"])

# Matriz de transições permitidas (RF04 + RBAC)
PROD_SETORES = [
    OrderStatus.PROD_ANA,
    OrderStatus.PROD_FELLIPE,
    OrderStatus.PROD_ATENDIMENTO,
]

ALLOWED_TRANSITIONS = {
    UserRole.ATENDENTE: {
        OrderStatus.FECHAMENTO: [
            OrderStatus.AGUARDANDO_INICIO,
            OrderStatus.PROD_ATENDIMENTO,
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_FELLIPE,
        ],
        # Puxar da fila de espera
        OrderStatus.AGUARDANDO_INICIO: [
            OrderStatus.PROD_ATENDIMENTO,
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_FELLIPE,
        ],
        OrderStatus.PROD_ATENDIMENTO: [
            OrderStatus.EMBALAGEM,
            OrderStatus.PROD_ANA,
        ],
        OrderStatus.PROD_RETIRADA: [OrderStatus.EMBALAGEM],
        OrderStatus.EMBALAGEM: [OrderStatus.PRONTO],
        OrderStatus.PRONTO: [OrderStatus.ENTREGUE],
    },

    UserRole.CRIACAO: {
        OrderStatus.FECHAMENTO: [OrderStatus.CRIACAO],
        # Puxar da fila de espera → Criação
        OrderStatus.AGUARDANDO_INICIO: [OrderStatus.CRIACAO],
        OrderStatus.CRIACAO: [
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_FELLIPE,
            OrderStatus.PROD_ATENDIMENTO,
        ],
    },

    UserRole.OPERADOR: {
        # Puxar da fila de espera → setores de produção
        OrderStatus.AGUARDANDO_INICIO: [
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_FELLIPE,
        ],
        OrderStatus.PROD_ANA: [
            OrderStatus.PROD_FELLIPE,
            OrderStatus.PROD_ATENDIMENTO,
            OrderStatus.CRIACAO,
            OrderStatus.PROD_RETIRADA,
        ],
        OrderStatus.PROD_FELLIPE: [
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_ATENDIMENTO,
            OrderStatus.CRIACAO,
            OrderStatus.PROD_RETIRADA,
        ],
        OrderStatus.PROD_ATENDIMENTO: [
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_FELLIPE,
            OrderStatus.CRIACAO,
            OrderStatus.PROD_RETIRADA,
        ],
        OrderStatus.PROD_RETIRADA: [
            OrderStatus.PROD_ANA,
            OrderStatus.PROD_FELLIPE,
            OrderStatus.PROD_ATENDIMENTO,
            OrderStatus.CRIACAO,
        ],
    },

    UserRole.ADMIN: {},  # pode tudo no can_transition
}

"""def broadcast_order_event(event_type: str, order_id: int):
    #Dispara evento para todos os terminais conectados
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(manager.broadcast({
                "type": event_type,
                "order_id": order_id
            }))
        else:
            loop.run_until_complete(manager.broadcast({
                "type": event_type,
                "order_id": order_id
            }))
    except Exception:
        pass  # não quebra a requisição se o WS falhar """

async def broadcast_order_event(event_type: str, order_id: int):
    await manager.broadcast({
        "type": event_type,
        "order_id": order_id
    })

def can_transition(user: User, current: OrderStatus, new: OrderStatus) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    allowed = ALLOWED_TRANSITIONS.get(user.role, {}).get(current, [])
    return new in allowed



@router.get("/", response_model=List[OrderOut])
def list_orders(
    status: Optional[OrderStatus] = None,
    q: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user)
):
    query = db.query(Order)
    query = query.filter(Order.deleted_at.is_(None))

    if status:
        query = query.filter(Order.status == status)

    if q:
        q_clean = q.replace(".", "").replace("-", "").replace("/", "")
        query = query.filter(
            or_(
                Order.numero_pedido.ilike(f"%{q}%"),
                Order.nome_cliente.ilike(f"%{q}%"),
                Order.cpf_cnpj.ilike(f"%{q}%"),
                Order.cpf_cnpj.ilike(f"%{q_clean}%")
            )
        )

    if data_inicio:
        try:
            dt_ini = datetime.strptime(data_inicio, "%Y-%m-%d")
            query = query.filter(Order.created_at >= dt_ini)
        except ValueError:
            pass

    if data_fim:
        try:
            dt_fim = datetime.strptime(data_fim, "%Y-%m-%d")
            query = query.filter(Order.created_at < dt_fim + timedelta(days=1))
        except ValueError:
            pass

    orders = query.order_by(Order.created_at.desc()).all()
    return [enrich_order(o, db) for o in orders]

@router.get("/kanban", response_model=dict)
def kanban_board(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    statuses = [
        OrderStatus.FECHAMENTO,
        OrderStatus.AGUARDANDO_INICIO,
        OrderStatus.CRIACAO,
        OrderStatus.PROD_ANA,
        OrderStatus.PROD_FELLIPE,
        OrderStatus.PROD_ATENDIMENTO,
        OrderStatus.PROD_RETIRADA,
        OrderStatus.EMBALAGEM,
        OrderStatus.PRONTO,
    ]
    result = {}
    for st in statuses:
        orders = (
            db.query(Order)
            .filter(
                Order.status == st,
                Order.deleted_at.is_(None),  # não mostra OS excluídas
            )
            .order_by(Order.created_at)
            .all()
        )
        result[st.value] = [enrich_order(o, db) for o in orders]
    return result

@router.get("/deleted/list", response_model=List[OrderOut])
def list_deleted_orders(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    orders = (
        db.query(Order)
        .filter(Order.deleted_at.isnot(None))
        .order_by(Order.deleted_at.desc())
        .all()
    )
    return [enrich_order(o, db) for o in orders]


@router.post("/", response_model=OrderOut)
async def create_order(
    order_in: OrderCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ATENDENTE, UserRole.CRIACAO, UserRole.ADMIN)),
):
    order = Order(
        **order_in.model_dump(),
        status=OrderStatus.FECHAMENTO,
        created_by=current.id
    )
    db.add(order)
    db.flush()

    log = StatusLog(
        order_id=order.id,
        from_status="-",
        to_status=OrderStatus.FECHAMENTO.value,
        user_id=current.id
    )
    db.add(log)
    db.commit()
    db.refresh(order)

    await broadcast_order_event("order_created", order.id)
    return enrich_order(order, db)


@router.patch("/{order_id}/status", response_model=OrderOut)
async def update_status(
    order_id: int,
    body: OrderUpdateStatus,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "OS não encontrada")

    if not can_transition(current, order.status, body.new_status):
        raise HTTPException(
            403,
            f"Seu perfil ({current.role.value}) não pode mover de {order.status.value} para {body.new_status.value}"
        )

    old = order.status
    order.status = body.new_status

    log = StatusLog(
        order_id=order.id,
        from_status=old.value,
        to_status=body.new_status.value,
        user_id=current.id
    )
    db.add(log)
    db.commit()
    db.refresh(order)

    await broadcast_order_event("order_updated", order.id)
    return enrich_order(order, db)


@router.post("/{order_id}/notify", response_model=OrderOut)
async def notify_client(
    order_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ATENDENTE, UserRole.ADMIN))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "OS não encontrada")
    if order.status != OrderStatus.PRONTO:
        raise HTTPException(400, "Só é possível notificar itens no status Pronto")

    order.notified_at = now_br()
    db.commit()
    db.refresh(order)

    await broadcast_order_event("order_updated", order.id)
    return enrich_order(order, db)


@router.post("/{order_id}/deliver", response_model=OrderOut)
async def deliver_order(
    order_id: int,
    body: OrderDeliver,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ATENDENTE, UserRole.ADMIN))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "OS não encontrada")
    if order.status != OrderStatus.PRONTO:
        raise HTTPException(400, "Só é possível entregar itens no status Pronto")

    order.status = OrderStatus.ENTREGUE
    order.delivered_at = body.delivered_at or now_br()
    order.delivered_to = body.delivered_to

    log = StatusLog(
        order_id=order.id,
        from_status=OrderStatus.PRONTO.value,
        to_status=OrderStatus.ENTREGUE.value,
        user_id=current.id
    )
    db.add(log)
    db.commit()
    db.refresh(order)

    await broadcast_order_event("order_updated", order.id)
    return enrich_order(order, db)


@router.get("/{order_id}/logs", response_model=List[StatusLogOut])
def get_logs(
    order_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "OS não encontrada")

    logs = (
        db.query(StatusLog)
        .filter(StatusLog.order_id == order_id)
        .order_by(StatusLog.timestamp.asc())
        .all()
    )

    result = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        result.append(StatusLogOut(
            id=log.id,
            from_status=log.from_status,
            to_status=log.to_status,
            user_id=log.user_id,
            user_name=user.full_name if user else "Usuário removido",
            timestamp=log.timestamp
        ))
    return result

def enrich_order(order: Order, db: Session = None) -> OrderOut:
    data = OrderOut.model_validate(order)
    days, color = calculate_aging(order.notified_at)
    data.aging_days = days
    data.aging_color = color

    if order.status == OrderStatus.ENTREGUE and db is not None:
        log = (
            db.query(StatusLog)
            .filter(
                StatusLog.order_id == order.id,
                StatusLog.to_status == "entregue"
            )
            .order_by(StatusLog.timestamp.desc())
            .first()
        )
        if log:
            user = db.query(User).filter(User.id == log.user_id).first()
            data.delivered_by = user.full_name if user else "—"
    if order.deleted_at and db is not None and order.deleted_by:
        user = db.query(User).filter(User.id == order.deleted_by).first()
        data.deleted_by_name = user.full_name if user else "—"      

    return data



@router.delete("/{order_id}")
async def soft_delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if not order:
        raise HTTPException(404, "OS não encontrada ou já excluída")

    order.deleted_at = now_br()
    order.deleted_by = current.id

    log = StatusLog(
        order_id=order.id,
        from_status=order.status.value,
        to_status="excluido",
        user_id=current.id,
    )
    db.add(log)
    db.commit()

    await broadcast_order_event("order_updated", order.id)
    return {"ok": True, "message": "OS excluída com sucesso"}


@router.post("/{order_id}/restore", response_model=OrderOut)
async def restore_order(
    order_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.isnot(None)).first()
    if not order:
        raise HTTPException(404, "OS excluída não encontrada")

    order.deleted_at = None
    order.deleted_by = None

    log = StatusLog(
        order_id=order.id,
        from_status="excluido",
        to_status=order.status.value,
        user_id=current.id,
    )
    db.add(log)
    db.commit()
    db.refresh(order)

    await broadcast_order_event("order_updated", order.id)
    return enrich_order(order, db)

@router.post("/{order_id}/undo-deliver", response_model=OrderOut)
async def undo_deliver(
    order_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.deleted_at.is_(None))
        .first()
    )
    if not order:
        raise HTTPException(404, "OS não encontrada")
    if order.status != OrderStatus.ENTREGUE:
        raise HTTPException(400, "Só é possível desfazer OS com status Entregue")

    old = order.status
    order.status = OrderStatus.PRONTO
    order.delivered_at = None
    order.delivered_to = None

    db.add(
        StatusLog(
            order_id=order.id,
            from_status=old.value,
            to_status=OrderStatus.PRONTO.value,
            user_id=current.id,
        )
    )
    db.commit()
    db.refresh(order)

    await broadcast_order_event("order_updated", order.id)
    return enrich_order(order, db)
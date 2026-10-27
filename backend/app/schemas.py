from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
from .models import UserRole, OrderStatus

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: UserRole = UserRole.OPERADOR

class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: UserRole
    is_active: bool = True

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class OrderCreate(BaseModel):
    numero_pedido: str
    nome_cliente: str
    cpf_cnpj: str
    descricao: str
    prazo: datetime

class OrderUpdateStatus(BaseModel):
    new_status: OrderStatus

class OrderNotify(BaseModel):
    pass  # só registra timestamp

class OrderDeliver(BaseModel):
    delivered_to: str
    delivered_at: Optional[datetime] = None

class OrderOut(BaseModel):
    id: int
    numero_pedido: str
    nome_cliente: str
    cpf_cnpj: str
    descricao: str
    status: OrderStatus
    prazo: Optional[datetime] = None
    created_at: datetime
    notified_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    delivered_to: Optional[str] = None
    aging_days: Optional[int] = None
    aging_color: Optional[str] = None
    delivered_by: Optional[str] = None
    deleted_at: Optional[datetime] = None
    deleted_by_name: Optional[str] = None

    class Config:
        from_attributes = True

class StatusLogOut(BaseModel):
    id: int
    from_status: str
    to_status: str
    user_id: int
    user_name: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: UserRole

# ===== ESTOQUE =====
class CategoryCreate(BaseModel):
    nome: str

class CategoryOut(BaseModel):
    id: int
    nome: str
    ativo: bool
    class Config:
        from_attributes = True

class StockItemCreate(BaseModel):
    categoria_id: int
    nome: str
    sku: Optional[str] = None
    unidade: str = "un"
    quantidade: float = 0
    minimo: float = 0
    observacao: Optional[str] = None

class StockItemUpdate(BaseModel):
    categoria_id: Optional[int] = None
    nome: Optional[str] = None
    sku: Optional[str] = None
    unidade: Optional[str] = None
    minimo: Optional[float] = None
    observacao: Optional[str] = None
    ativo: Optional[bool] = None

class StockItemOut(BaseModel):
    id: int
    categoria_id: int
    categoria_nome: Optional[str] = None
    nome: str
    sku: Optional[str]
    unidade: str
    quantidade: float
    minimo: float
    observacao: Optional[str]
    ativo: bool
    baixo: bool = False
    class Config:
        from_attributes = True

class StockAdjust(BaseModel):
    tipo: str  # entrada | saida | inventario
    quantidade: float
    motivo: str

class StockMovementOut(BaseModel):
    id: int
    item_id: int
    item_nome: Optional[str] = None
    tipo: str
    qtd_anterior: float
    qtd_nova: float
    qtd_delta: float
    motivo: str
    user_id: int
    user_name: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class StockRequestCreate(BaseModel):
    item_id: int
    quantidade: float
    motivo: str

class StockRequestDecide(BaseModel):
    motivo: Optional[str] = None

class StockRequestOut(BaseModel):
    id: int
    item_id: int
    item_nome: Optional[str] = None
    quantidade: float
    motivo: str
    status: str
    solicitado_por: int
    solicitante_nome: Optional[str] = None
    decidido_por: Optional[int] = None
    decisor_nome: Optional[str] = None
    decisao_motivo: Optional[str] = None
    created_at: datetime
    decided_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# ===== ESTOQUE =====

class CategoryCreate(BaseModel):
    nome: str

class CategoryOut(BaseModel):
    id: int
    nome: str
    ativo: bool
    class Config:
        from_attributes = True

class StockItemCreate(BaseModel):
    categoria_id: int
    nome: str
    sku: Optional[str] = None
    unidade: str = "un"
    quantidade: float = 0
    minimo: float = 0
    observacao: Optional[str] = None

class StockItemUpdate(BaseModel):
    categoria_id: Optional[int] = None
    nome: Optional[str] = None
    sku: Optional[str] = None
    unidade: Optional[str] = None
    minimo: Optional[float] = None
    observacao: Optional[str] = None
    ativo: Optional[bool] = None

class StockItemOut(BaseModel):
    id: int
    categoria_id: int
    categoria_nome: Optional[str] = None
    nome: str
    sku: Optional[str]
    unidade: str
    quantidade: float
    minimo: float
    observacao: Optional[str]
    ativo: bool
    baixo: bool = False          # mantém compatibilidade
    status: str = "ok"           # zerado | urgente | baixo | atencao | ok

    class Config:
        from_attributes = True

class StockAdjust(BaseModel):
    tipo: str  # entrada | saida | inventario
    quantidade: float
    motivo: str

class StockMovementOut(BaseModel):
    id: int
    item_id: int
    item_nome: Optional[str] = None
    tipo: str
    qtd_anterior: float
    qtd_nova: float
    qtd_delta: float
    motivo: str
    user_id: int
    user_name: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class StockRequestCreate(BaseModel):
    item_id: int
    quantidade: float
    motivo: str

class StockRequestDecide(BaseModel):
    motivo: Optional[str] = None

class StockRequestOut(BaseModel):
    id: int
    item_id: int
    item_nome: Optional[str] = None
    quantidade: float
    motivo: str
    status: str
    solicitado_por: int
    solicitante_nome: Optional[str] = None
    decidido_por: Optional[int] = None
    decisor_nome: Optional[str] = None
    decisao_motivo: Optional[str] = None
    created_at: datetime
    decided_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class CategoryUpdate(BaseModel):
    nome: Optional[str] = None
    ativo: Optional[bool] = None
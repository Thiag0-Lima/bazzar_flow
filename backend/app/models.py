from datetime import datetime
from .timezone_utils import now_br
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from .database import Base

class UserRole(str, enum.Enum):
    ATENDENTE = "atendente"
    CRIACAO = "criacao"
    OPERADOR = "operador"
    ESTOQUE  = "estoque"
    ADMIN = "admin"

class OrderStatus(str, enum.Enum):
    FECHAMENTO = "fechamento"
    AGUARDANDO_INICIO = "aguardando_inicio"
    CRIACAO = "criacao"
    PROD_ANA = "prod_ana"
    PROD_FELLIPE = "prod_fellipe"
    PROD_ATENDIMENTO = "prod_atendimento"
    PROD_RETIRADA = "prod_retirada"
    EMBALAGEM = "embalagem"
    PRONTO = "pronto"
    ENTREGUE = "entregue"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.OPERADOR)
    is_active: Mapped[bool] = mapped_column(default=True)

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero_pedido: Mapped[str] = mapped_column(String(50), index=True)
    nome_cliente: Mapped[str] = mapped_column(String(150), index=True)
    cpf_cnpj: Mapped[str] = mapped_column(String(20), index=True)
    prazo: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    descricao: Mapped[str] = mapped_column(Text)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.FECHAMENTO)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_br)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_to: Mapped[str | None] = mapped_column(String(150), nullable=True)
    
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, default=None)
    
    logs = relationship("StatusLog", back_populates="order", cascade="all, delete-orphan")

class StatusLog(Base):
    __tablename__ = "status_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    from_status: Mapped[str] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=now_br)

    order = relationship("Order", back_populates="logs")

class StockCategory(Base):
    __tablename__ = "stock_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True)
    ativo: Mapped[bool] = mapped_column(default=True)

class StockItem(Base):
    __tablename__ = "stock_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    categoria_id: Mapped[int] = mapped_column(ForeignKey("stock_categories.id"))
    nome: Mapped[str] = mapped_column(String(150), index=True)
    sku: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    unidade: Mapped[str] = mapped_column(String(20), default="un")
    quantidade: Mapped[float] = mapped_column(default=0)
    minimo: Mapped[float] = mapped_column(default=0)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_br)

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"))
    tipo: Mapped[str] = mapped_column(String(20))  # entrada | saida | inventario | solicitacao
    qtd_anterior: Mapped[float] = mapped_column()
    qtd_nova: Mapped[float] = mapped_column()
    qtd_delta: Mapped[float] = mapped_column()
    motivo: Mapped[str] = mapped_column(Text)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_br)

class StockRequestStatus(str, enum.Enum):
    PENDENTE = "pendente"
    APROVADA = "aprovada"
    NEGADA = "negada"
    CANCELADA = "cancelada"

class StockRequest(Base):
    __tablename__ = "stock_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("stock_items.id"))
    quantidade: Mapped[float] = mapped_column()
    motivo: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pendente")
    solicitado_por: Mapped[int] = mapped_column(ForeignKey("users.id"))
    decidido_por: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decisao_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_br)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
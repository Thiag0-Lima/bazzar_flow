from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Sao_Paulo")

def now_br() -> datetime:
    """Horário atual de Brasília, sem tzinfo (compatível com SQLite)."""
    return datetime.now(TZ).replace(tzinfo=None)

def to_br_iso(dt: datetime | None) -> str | None:
    """Serializa datetime para ISO no fuso de Brasília."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # assume que veio naive do banco como horário de Brasília
        dt = dt.replace(tzinfo=TZ)
    else:
        dt = dt.astimezone(TZ)
    return dt.isoformat()
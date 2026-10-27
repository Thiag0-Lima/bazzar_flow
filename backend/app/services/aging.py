from datetime import datetime
from ..timezone_utils import now_br

def calculate_aging(notified_at: datetime | None) -> tuple[int | None, str | None]:
    if not notified_at:
        return None, None

    # Garante naive dos dois lados
    notified = notified_at.replace(tzinfo=None) if notified_at.tzinfo else notified_at
    now = now_br()
    if now.tzinfo:
        now = now.replace(tzinfo=None)

    days = (now - notified).days

    if days < 3:
        color = "cinza"
    elif 3 <= days <= 7:
        color = "verde"
    elif 8 <= days <= 31:
        color = "amarelo"
    else:
        color = "vermelho"

    return days, color
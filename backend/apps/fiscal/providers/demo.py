import hashlib
import time

from .base import EmitResult, FiscalProvider


class DemoProvider(FiscalProvider):
    """Simula HKA: genera un CUFE/protocolo falsos, sin validez fiscal."""

    name = "demo"

    def emit(self, invoice) -> EmitResult:
        seed = f"{invoice.id}-{invoice.invoice_number}-{time.time_ns()}"
        digest = hashlib.sha256(seed.encode()).hexdigest()  # 64 hex
        cufe = f"FE{digest}"  # ~66 caracteres, formato realista
        protocol = str(int(digest[:12], 16))
        return EmitResult(
            cufe=cufe, protocol=protocol, status="authorized", environment="demo"
        )

    def void(self, doc) -> None:
        return None

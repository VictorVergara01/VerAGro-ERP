from dataclasses import dataclass


@dataclass
class EmitResult:
    cufe: str
    protocol: str
    status: str
    environment: str


class FiscalProvider:
    name = "base"

    def emit(self, invoice) -> EmitResult:
        raise NotImplementedError

    def void(self, doc) -> None:
        raise NotImplementedError

from __future__ import annotations

import importlib.util
import platform
from dataclasses import dataclass
from typing import Callable


VALID_BACKENDS = frozenset({"auto", "mlx", "cuda", "cpu"})


@dataclass(frozen=True, slots=True)
class HardwareSelection:
    requested: str
    backend: str
    device: str
    reason: str


def is_apple_silicon(system: str | None = None, machine: str | None = None) -> bool:
    return (system or platform.system()).lower() == "darwin" and (machine or platform.machine()).lower() in {
        "arm64",
        "aarch64",
    }


def cuda_is_available() -> bool:
    """Probe CUDA lazily so a Mac/CPU install never imports or requires torch."""
    if importlib.util.find_spec("torch") is None:
        return False
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def select_hardware_backend(
    requested: str,
    *,
    system: str | None = None,
    machine: str | None = None,
    cuda_probe: Callable[[], bool] = cuda_is_available,
) -> HardwareSelection:
    normalized = str(requested or "auto").strip().lower()
    if normalized not in VALID_BACKENDS:
        allowed = ", ".join(sorted(VALID_BACKENDS))
        raise RuntimeError(f"EMORA_BACKEND must be one of: {allowed}.")

    apple = is_apple_silicon(system, machine)
    if normalized == "auto":
        if apple:
            return HardwareSelection(normalized, "mlx", "metal", "Apple Silicon detected")
        if cuda_probe():
            return HardwareSelection(normalized, "cuda", "cuda", "NVIDIA CUDA is available")
        return HardwareSelection(normalized, "cpu", "cpu", "no supported GPU detected")

    if normalized == "mlx":
        if not apple:
            raise RuntimeError("EMORA_BACKEND=mlx requires macOS on Apple Silicon.")
        return HardwareSelection(normalized, "mlx", "metal", "explicit MLX override")
    if normalized == "cuda":
        if not cuda_probe():
            raise RuntimeError("EMORA_BACKEND=cuda was requested, but PyTorch cannot access an NVIDIA CUDA device.")
        return HardwareSelection(normalized, "cuda", "cuda", "explicit CUDA override")
    return HardwareSelection(normalized, "cpu", "cpu", "explicit CPU override")


def describe_device(selection: HardwareSelection) -> str:
    if selection.backend == "mlx":
        return f"Apple Silicon ({platform.machine()})"
    if selection.backend == "cuda":
        try:
            import torch

            return str(torch.cuda.get_device_name(torch.cuda.current_device()))
        except Exception:
            return "NVIDIA CUDA"
    return platform.processor() or platform.machine() or "CPU"


__all__ = ["HardwareSelection", "VALID_BACKENDS", "cuda_is_available", "describe_device", "is_apple_silicon", "select_hardware_backend"]

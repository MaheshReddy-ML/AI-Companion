from __future__ import annotations

from pathlib import Path

import pytest

from app.inference.hardware import is_apple_silicon, select_hardware_backend


def test_auto_selects_mlx_on_apple_silicon_without_probing_cuda():
    def unexpected_cuda_probe() -> bool:
        raise AssertionError("Apple Silicon selection must not import/probe CUDA")

    selected = select_hardware_backend(
        "auto", system="Darwin", machine="arm64", cuda_probe=unexpected_cuda_probe
    )

    assert selected.backend == "mlx"
    assert selected.device == "metal"


def test_auto_selects_cuda_when_available_and_cpu_otherwise():
    cuda = select_hardware_backend("auto", system="Linux", machine="x86_64", cuda_probe=lambda: True)
    cpu = select_hardware_backend("auto", system="Linux", machine="x86_64", cuda_probe=lambda: False)

    assert (cuda.backend, cuda.device) == ("cuda", "cuda")
    assert (cpu.backend, cpu.device) == ("cpu", "cpu")


def test_explicit_backend_selection_validates_hardware_and_values():
    assert select_hardware_backend("cpu", cuda_probe=lambda: False).backend == "cpu"
    assert select_hardware_backend("mlx", system="Darwin", machine="arm64").backend == "mlx"
    assert select_hardware_backend("cuda", system="Linux", machine="x86_64", cuda_probe=lambda: True).backend == "cuda"

    with pytest.raises(RuntimeError, match="requires macOS on Apple Silicon"):
        select_hardware_backend("mlx", system="Linux", machine="x86_64")
    with pytest.raises(RuntimeError, match="cannot access an NVIDIA CUDA device"):
        select_hardware_backend("cuda", system="Linux", machine="x86_64", cuda_probe=lambda: False)
    with pytest.raises(RuntimeError, match="EMORA_BACKEND must be one of"):
        select_hardware_backend("tpu")


def test_application_orchestration_uses_inference_interface_not_mlx_packages():
    root = Path(__file__).resolve().parents[1]
    application_files = [
        root / "app/services/companion_chat.py",
        root / "app/routers/api_chat.py",
        root / "app/routers/admin.py",
    ]

    for path in application_files:
        source = path.read_text(encoding="utf-8")
        assert "from mlx" not in source
        assert "import mlx" not in source
        assert "app.inference.provider" in source


def test_dependency_groups_keep_mlx_out_of_cuda_and_cpu_installs():
    root = Path(__file__).resolve().parents[1]
    for name in ("requirements-cuda.txt", "requirements-cpu.txt"):
        requirements = (root / name).read_text(encoding="utf-8").lower()
        assert "mlx-lm" not in requirements
        assert "mlx-vlm" not in requirements
        assert "mlx-audio" not in requirements


def test_apple_silicon_aliases_are_supported():
    assert is_apple_silicon("Darwin", "arm64")
    assert is_apple_silicon("Darwin", "aarch64")
    assert not is_apple_silicon("Linux", "aarch64")

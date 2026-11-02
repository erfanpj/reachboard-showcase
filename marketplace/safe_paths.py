"""Restrict post-login redirects to local showcase paths."""

from __future__ import annotations

DEFAULT_CATALOG = "/en/catalog/"

_ALLOWED_PREFIXES = ("/en/", "/fa/", "/demo/", "/campaign/")


def safe_local_path(url: str | None, default: str = DEFAULT_CATALOG) -> str:
    if not url:
        return default
    path = url.strip()
    if not path.startswith("/") or path.startswith("//") or "://" in path:
        return default
    if ".." in path or "\\" in path:
        return default
    if not any(path.startswith(prefix) for prefix in _ALLOWED_PREFIXES):
        return default
    return path

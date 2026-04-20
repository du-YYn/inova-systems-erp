from rest_framework.exceptions import ValidationError

MAX_ASSET_SIZE     = 5 * 1024 * 1024  # 5 MB
MAX_THUMBNAIL_SIZE = 2 * 1024 * 1024  # 2 MB

ALLOWED_IMAGE_MIMES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}

_MAGIC_PREFIXES = {
    "image/png":  [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/gif":  [b"GIF87a", b"GIF89a"],
    "image/webp": [b"RIFF"],  # + bytes 8-11 == b"WEBP"
}


def _matches_magic(head: bytes, content_type: str) -> bool:
    if content_type == "image/svg+xml":
        stripped = head.lstrip(b"\xef\xbb\xbf").lstrip()
        lowered = stripped[:64].lower()
        return lowered.startswith(b"<?xml") or lowered.startswith(b"<svg")
    if content_type == "image/webp":
        return head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WEBP"
    return any(head.startswith(p) for p in _MAGIC_PREFIXES.get(content_type, []))


def validate_image_upload(file, max_size: int, *, label: str = "file"):
    if file is None:
        raise ValidationError({label: "Arquivo ausente."})

    if file.size > max_size:
        raise ValidationError({
            label: f"Arquivo muito grande: {file.size} bytes "
                   f"(máx {max_size // (1024 * 1024)} MB).",
        })

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_MIMES:
        raise ValidationError({
            label: f"Tipo não permitido: '{content_type or 'desconhecido'}'. "
                   f"Permitidos: {', '.join(sorted(ALLOWED_IMAGE_MIMES))}.",
        })

    try:
        head = file.read(32)
    finally:
        file.seek(0)

    if not _matches_magic(head, content_type):
        raise ValidationError({label: "Conteúdo não corresponde ao tipo declarado (magic bytes inválidos)."})

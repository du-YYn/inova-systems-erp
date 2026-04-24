from rest_framework.exceptions import ValidationError

MAX_ASSET_SIZE = 5 * 1024 * 1024      # 5 MB
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
    "image/webp": [b"RIFF"],  # + verificação extra dos bytes 8-11 == b"WEBP"
}


def _matches_magic(head: bytes, content_type: str) -> bool:
    if content_type == "image/svg+xml":
        # SVG é texto XML; aceita BOM, whitespace, comentário e <?xml ou <svg
        stripped = head.lstrip(b"\xef\xbb\xbf").lstrip()
        lowered = stripped[:64].lower()
        return lowered.startswith(b"<?xml") or lowered.startswith(b"<svg")
    if content_type == "image/webp":
        return head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WEBP"
    prefixes = _MAGIC_PREFIXES.get(content_type, [])
    return any(head.startswith(p) for p in prefixes)


def validate_image_upload(arquivo, max_size: int, *, label: str = "arquivo"):
    if arquivo is None:
        raise ValidationError({label: "Arquivo ausente."})

    if arquivo.size > max_size:
        raise ValidationError({
            label: f"Arquivo muito grande: {arquivo.size} bytes (máx {max_size} bytes / "
                   f"{max_size // (1024 * 1024)} MB)."
        })

    content_type = (arquivo.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_MIMES:
        raise ValidationError({
            label: f"Tipo de arquivo não permitido: '{content_type or 'desconhecido'}'. "
                   f"Permitidos: {', '.join(sorted(ALLOWED_IMAGE_MIMES))}."
        })

    try:
        head = arquivo.read(32)
    finally:
        arquivo.seek(0)

    if not _matches_magic(head, content_type):
        raise ValidationError({
            label: "Conteúdo do arquivo não corresponde ao tipo declarado (magic bytes inválidos)."
        })

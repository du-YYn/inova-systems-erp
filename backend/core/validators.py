import os
from django.core.exceptions import ValidationError


# ── Extensões permitidas para upload ─────────────────────────────────────────
# SVG removido intencionalmente: vetor conhecido de XSS — pode conter
# <script>/<foreignObject>/onload=. Para permitir SVG no futuro, sanitizar
# com `defusedxml` + whitelist de tags antes de salvar.
# v32 F6 (doc 05 §9): áudio permitido para anexos de chamado (.mp3/.ogg/
# .m4a/.wav), até 10MB (mesmo teto de MAX_FILE_SIZE_MB).
ALLOWED_AUDIO_EXTENSIONS = {'.mp3', '.ogg', '.m4a', '.wav'}

ALLOWED_FILE_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.txt', '.zip', '.rar', '.7z',
} | ALLOWED_AUDIO_EXTENSIONS

ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}

MAX_FILE_SIZE_MB = 10
MAX_IMAGE_SIZE_MB = 5
MAX_AUDIO_SIZE_MB = 10

# ── Magic bytes por extensão (v32 F6, doc 08 §8.3) ──────────────────────────
# Assinatura manual dos formatos permitidos (lib `filetype` não está em
# requirements — decisão F6: zero dependência nova). Cada entrada é uma lista
# de assinaturas aceitas; tupla (offset, bytes). Extensões SEM assinatura
# confiável (texto puro: .txt/.csv) não são verificadas — aditivo, não quebra
# uploads atuais.
_MAGIC_SIGNATURES: dict[str, list[tuple[int, bytes]]] = {
    '.pdf':  [(0, b'%PDF')],
    '.png':  [(0, b'\x89PNG\r\n\x1a\n')],
    '.jpg':  [(0, b'\xff\xd8\xff')],
    '.jpeg': [(0, b'\xff\xd8\xff')],
    '.gif':  [(0, b'GIF87a'), (0, b'GIF89a')],
    '.webp': [(0, b'RIFF')],  # + 'WEBP' no offset 8 (checado abaixo)
    # OOXML/ZIP (docx/xlsx/zip compartilham container PK)
    '.zip':  [(0, b'PK\x03\x04'), (0, b'PK\x05\x06'), (0, b'PK\x07\x08')],
    '.docx': [(0, b'PK\x03\x04')],
    '.xlsx': [(0, b'PK\x03\x04')],
    # OLE2 (doc/xls legados)
    '.doc':  [(0, b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1')],
    '.xls':  [(0, b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1')],
    '.rar':  [(0, b'Rar!\x1a\x07')],
    '.7z':   [(0, b'7z\xbc\xaf\x27\x1c')],
    # Áudio (v32 F6)
    '.mp3':  [(0, b'ID3'), (0, b'\xff\xfb'), (0, b'\xff\xf3'), (0, b'\xff\xf2')],
    '.ogg':  [(0, b'OggS')],
    '.wav':  [(0, b'RIFF')],  # + 'WAVE' no offset 8 (checado abaixo)
    '.m4a':  [(4, b'ftyp')],  # container ISO-BMFF: 'ftyp' no offset 4
}

# Containers RIFF: byte 8..12 distingue WEBP de WAVE.
_RIFF_SUBTYPES = {'.webp': b'WEBP', '.wav': b'WAVE'}


def validate_file_extension(value):
    """Valida extensão de arquivo enviado."""
    ext = os.path.splitext(value.name)[1].lower()
    if ext not in ALLOWED_FILE_EXTENSIONS:
        raise ValidationError(
            f'Extensão "{ext}" não permitida. '
            f'Extensões aceitas: {", ".join(sorted(ALLOWED_FILE_EXTENSIONS))}'
        )


def validate_image_extension(value):
    """Valida extensão de imagem."""
    ext = os.path.splitext(value.name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            f'Extensão "{ext}" não é uma imagem válida. '
            f'Extensões aceitas: {", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS))}'
        )


def validate_file_magic_bytes(value):
    """Valida assinatura (magic bytes) do arquivo contra a extensão declarada.

    v32 F6 (doc 08 §8.3): extensão sozinha é spoofável — um .exe renomeado
    para .pdf passava. Confere os primeiros bytes contra a assinatura do
    formato. Extensões sem assinatura confiável (.txt/.csv) passam direto.
    """
    ext = os.path.splitext(value.name)[1].lower()
    signatures = _MAGIC_SIGNATURES.get(ext)
    if not signatures:
        return  # texto puro ou extensão sem assinatura — só a extensão valida

    try:
        pos = value.tell()
    except (OSError, ValueError):
        pos = None
    value.seek(0)
    header = value.read(16)
    if pos is not None:
        value.seek(pos)
    else:
        value.seek(0)

    matched = any(
        header[offset:offset + len(sig)] == sig for offset, sig in signatures
    )
    if matched and ext in _RIFF_SUBTYPES:
        matched = header[8:12] == _RIFF_SUBTYPES[ext]

    if not matched:
        raise ValidationError(
            f'Conteúdo do arquivo não corresponde à extensão "{ext}" '
            '(assinatura inválida).'
        )


def validate_audio_extension(value):
    """Valida extensão de áudio (anexos de chamado, v32 F6)."""
    ext = os.path.splitext(value.name)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise ValidationError(
            f'Extensão "{ext}" não é um áudio válido. '
            f'Extensões aceitas: {", ".join(sorted(ALLOWED_AUDIO_EXTENSIONS))}'
        )


def validate_file_size(value):
    """Valida tamanho máximo de arquivo (10MB)."""
    limit = MAX_FILE_SIZE_MB * 1024 * 1024
    if value.size > limit:
        raise ValidationError(
            f'Arquivo muito grande ({value.size / 1024 / 1024:.1f}MB). '
            f'Tamanho máximo: {MAX_FILE_SIZE_MB}MB.'
        )


def validate_image_size(value):
    """Valida tamanho máximo de imagem (5MB)."""
    limit = MAX_IMAGE_SIZE_MB * 1024 * 1024
    if value.size > limit:
        raise ValidationError(
            f'Imagem muito grande ({value.size / 1024 / 1024:.1f}MB). '
            f'Tamanho máximo: {MAX_IMAGE_SIZE_MB}MB.'
        )


def validate_contact_list(value):
    """Valida estrutura do JSONField 'contacts' em Customer."""
    if not isinstance(value, list):
        raise ValidationError('Contatos deve ser uma lista.')
    for i, contact in enumerate(value):
        if not isinstance(contact, dict):
            raise ValidationError(f'Contato #{i + 1} deve ser um objeto.')
        allowed_keys = {'name', 'email', 'phone', 'role'}
        invalid_keys = set(contact.keys()) - allowed_keys
        if invalid_keys:
            raise ValidationError(
                f'Contato #{i + 1} possui campos inválidos: {", ".join(invalid_keys)}'
            )


def validate_invoice_items(value):
    """Valida estrutura do JSONField 'items' em Invoice."""
    if not isinstance(value, list):
        raise ValidationError('Itens deve ser uma lista.')
    for i, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValidationError(f'Item #{i + 1} deve ser um objeto.')
        allowed_keys = {'description', 'quantity', 'unit_price', 'total', 'unit'}
        invalid_keys = set(item.keys()) - allowed_keys
        if invalid_keys:
            raise ValidationError(
                f'Item #{i + 1} possui campos inválidos: {", ".join(invalid_keys)}'
            )


def validate_tags_list(value):
    """Valida que tags é uma lista de strings."""
    if not isinstance(value, list):
        raise ValidationError('Tags deve ser uma lista.')
    for i, tag in enumerate(value):
        if not isinstance(tag, str):
            raise ValidationError(f'Tag #{i + 1} deve ser uma string.')
        if len(tag) > 50:
            raise ValidationError(f'Tag #{i + 1} excede 50 caracteres.')


def validate_scope_list(value):
    """Valida estrutura do JSONField 'scope' em Proposal."""
    if not isinstance(value, list):
        raise ValidationError('Escopo deve ser uma lista.')
    for i, item in enumerate(value):
        if not isinstance(item, (str, dict)):
            raise ValidationError(f'Item de escopo #{i + 1} deve ser string ou objeto.')


def validate_timeline_dict(value):
    """Valida estrutura do JSONField 'timeline' em Proposal."""
    if not isinstance(value, dict):
        raise ValidationError('Timeline deve ser um objeto.')
    allowed_keys = {'start', 'end', 'phases', 'duration', 'notes'}
    invalid_keys = set(value.keys()) - allowed_keys
    if invalid_keys:
        raise ValidationError(
            f'Timeline possui campos inválidos: {", ".join(invalid_keys)}'
        )


def validate_template_phases(value):
    """Valida estrutura do JSONField 'phases' em ProjectTemplate."""
    if not isinstance(value, list):
        raise ValidationError('Fases deve ser uma lista.')
    for i, phase in enumerate(value):
        if not isinstance(phase, dict):
            raise ValidationError(f'Fase #{i + 1} deve ser um objeto.')
        allowed_keys = {'name', 'description', 'order', 'duration_days'}
        invalid_keys = set(phase.keys()) - allowed_keys
        if invalid_keys:
            raise ValidationError(
                f'Fase #{i + 1} possui campos inválidos: {", ".join(invalid_keys)}'
            )


# ── Validadores de documentos brasileiros ────────────────────────────────────

def validate_cpf(value):
    """Valida número de CPF brasileiro."""
    import re
    cleaned = re.sub(r'\D', '', value)
    if len(cleaned) != 11:
        raise ValidationError('CPF deve conter 11 dígitos.')
    if len(set(cleaned)) == 1:
        raise ValidationError('CPF inválido.')

    # Primeiro dígito verificador
    total = sum(int(cleaned[i]) * (10 - i) for i in range(9))
    rest = (total * 10) % 11
    if rest in (10, 11):
        rest = 0
    if rest != int(cleaned[9]):
        raise ValidationError('CPF inválido.')

    # Segundo dígito verificador
    total = sum(int(cleaned[i]) * (11 - i) for i in range(10))
    rest = (total * 10) % 11
    if rest in (10, 11):
        rest = 0
    if rest != int(cleaned[10]):
        raise ValidationError('CPF inválido.')


def validate_cnpj(value):
    """Valida número de CNPJ brasileiro."""
    import re
    cleaned = re.sub(r'\D', '', value)
    if len(cleaned) != 14:
        raise ValidationError('CNPJ deve conter 14 dígitos.')
    if len(set(cleaned)) == 1:
        raise ValidationError('CNPJ inválido.')

    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

    # Primeiro dígito verificador
    total = sum(int(cleaned[i]) * weights1[i] for i in range(12))
    rest = total % 11
    digit1 = 0 if rest < 2 else 11 - rest
    if int(cleaned[12]) != digit1:
        raise ValidationError('CNPJ inválido.')

    # Segundo dígito verificador
    total = sum(int(cleaned[i]) * weights2[i] for i in range(13))
    rest = total % 11
    digit2 = 0 if rest < 2 else 11 - rest
    if int(cleaned[13]) != digit2:
        raise ValidationError('CNPJ inválido.')

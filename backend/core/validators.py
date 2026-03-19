import os
from django.core.exceptions import ValidationError


# ── Extensões permitidas para upload ─────────────────────────────────────────
ALLOWED_FILE_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.txt', '.zip', '.rar', '.7z',
}

ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}

MAX_FILE_SIZE_MB = 10
MAX_IMAGE_SIZE_MB = 5


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

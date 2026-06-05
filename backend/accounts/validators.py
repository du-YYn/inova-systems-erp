"""Validadores de senha customizados (S7L).

Adiciona complexidade obrigatoria sobre os validadores default do Django,
reduzindo o espaco viavel de brute-force/dictionary attacks.
"""
import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


class ComplexityValidator:
    """Exige pelo menos 1 letra maiuscula, 1 digito e 1 simbolo na senha.

    Senhas como "senha1234" (passam no Common list PT-BR + min_length=12) eram
    aceitas e cabem em ataques de dicionario regional. Forcar mix de classes
    de caracteres multiplica o espaco de busca por ordens de magnitude e
    bloqueia padroes triviais.
    """

    SYMBOL_REGEX = re.compile(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>/?`~]')

    def validate(self, password, user=None):
        errors = []
        if not re.search(r'[A-Z]', password):
            errors.append(_('A senha deve conter pelo menos 1 letra maiuscula.'))
        if not re.search(r'\d', password):
            errors.append(_('A senha deve conter pelo menos 1 digito.'))
        if not self.SYMBOL_REGEX.search(password):
            errors.append(_(
                'A senha deve conter pelo menos 1 simbolo (! @ # $ % & etc).'
            ))
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return _(
            'A senha deve conter pelo menos 1 letra maiuscula, 1 digito e '
            '1 simbolo.'
        )

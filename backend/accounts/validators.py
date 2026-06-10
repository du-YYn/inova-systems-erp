"""Validadores de senha do projeto (F0).

Complementa os validadores default do Django com requisito de
complexidade. Aplicado apenas em criacao/troca de senha — usuarios
existentes nao sao afetados ate a proxima troca.
"""
import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class PasswordComplexityValidator:
    """Exige ao menos 1 maiuscula, 1 digito e 1 simbolo.

    O tamanho minimo (12) fica no MinimumLengthValidator via OPTIONS,
    para manter a mensagem de erro padrao do Django.
    """

    SYMBOL_RE = re.compile(r'[^A-Za-z0-9]')

    def validate(self, password, user=None):
        errors = []
        if not re.search(r'[A-Z]', password):
            errors.append(_('A senha precisa de ao menos 1 letra maiúscula.'))
        if not re.search(r'[0-9]', password):
            errors.append(_('A senha precisa de ao menos 1 número.'))
        if not self.SYMBOL_RE.search(password):
            errors.append(_('A senha precisa de ao menos 1 símbolo (ex: ! @ # $).'))
        if errors:
            raise ValidationError(errors, code='password_too_simple')

    def get_help_text(self):
        return _('Sua senha precisa conter letra maiúscula, número e símbolo.')

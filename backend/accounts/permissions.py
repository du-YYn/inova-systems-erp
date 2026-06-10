from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    """Somente administradores."""
    message = 'Acesso restrito a administradores.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'admin'
        )


class IsAdminOrManager(BasePermission):
    """Administradores e gerentes."""
    message = 'Acesso restrito a administradores e gerentes.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('admin', 'manager')
        )


class IsAdminOrManagerOrOperator(BasePermission):
    """Administradores, gerentes e operadores. Viewers têm acesso somente leitura."""
    message = 'Acesso negado.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            # Todos os papéis autenticados podem ler
            return True
        # Escrita exige pelo menos operador
        return request.user.role in ('admin', 'manager', 'operator')


class IsAdminOrManagerOrOperatorStrict(BasePermission):
    """Administradores, gerentes e operadores — viewers não têm nenhum acesso."""
    message = 'Acesso negado.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('admin', 'manager', 'operator')
        )


class IsAdminOrReadOnly(BasePermission):
    """Leitura para todos autenticados; escrita apenas para admin."""
    message = 'Acesso restrito a administradores.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role == 'admin'


class IsPartner(BasePermission):
    """Somente parceiros de indicação ativos."""
    message = 'Acesso restrito a parceiros.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.role == 'partner'
        )


# ─── v32 F3: RBAC por setor (doc 08 §7.2) ────────────────────────────────────
#
# Matriz de acesso: chave = setor dono do recurso; valores = setores do
# usuário com leitura (read) e escrita (write). Regras fora da matriz:
#   - admin: bypass total (ignora a matriz)
#   - viewer: leitura global (SAFE_METHODS em qualquer recurso)
#   - manager/operator: precisam de interseção entre User.sectors e o set
#   - partner: nunca acessa recursos internos de setor
SECTOR_ACCESS_MATRIX = {
    'comercial': {
        'read': {'comercial', 'juridico', 'financeiro', 'producao', 'suporte', 'diretoria'},
        'write': {'comercial'},
    },
    'juridico': {
        'read': {'comercial', 'juridico', 'financeiro', 'producao', 'diretoria'},
        'write': {'juridico'},
    },
    'financeiro': {
        'read': {'comercial', 'juridico', 'financeiro', 'producao', 'diretoria'},
        'write': {'financeiro'},
    },
    'producao': {
        'read': {'comercial', 'juridico', 'financeiro', 'producao', 'suporte', 'diretoria'},
        'write': {'producao'},
    },
    'suporte': {
        'read': {'comercial', 'financeiro', 'producao', 'suporte', 'diretoria'},
        'write': {'suporte'},
    },
    'diretoria': {
        'read': {'suporte', 'diretoria'},
        'write': {'diretoria'},
    },
}


def HasSectorAccess(sector, access_map=None):
    """Factory de permission class por setor (v32 F3, doc 08 §7.2).

    Uso: ``permission_classes = [HasSectorAccess('juridico')]``

    Args:
        sector: setor dono do recurso ('juridico', 'comercial', ...)
        access_map: mapa {setor: {'read': set, 'write': set}} — default
            SECTOR_ACCESS_MATRIX. Injetável para testes/extensões.

    Retorna uma subclasse de BasePermission (DRF instancia por view).
    """
    matrix = access_map or SECTOR_ACCESS_MATRIX
    if sector not in matrix:
        raise ValueError(f'Setor desconhecido para HasSectorAccess: {sector!r}')
    read_set = set(matrix[sector]['read'])
    write_set = set(matrix[sector]['write'])

    class _HasSectorAccess(BasePermission):
        message = 'Acesso negado para o seu setor.'

        def has_permission(self, request, view):
            user = request.user
            if not user or not user.is_authenticated:
                return False
            if user.role == 'admin':
                return True
            if user.role == 'viewer':
                return request.method in SAFE_METHODS
            if user.role not in ('manager', 'operator'):
                # partner (e papéis futuros) não acessam recursos de setor
                return False
            user_sectors = set(user.sectors or [])
            if request.method in SAFE_METHODS:
                return bool(user_sectors & read_set)
            return bool(user_sectors & write_set)

    _HasSectorAccess.__name__ = f'HasSectorAccess_{sector}'
    _HasSectorAccess.__qualname__ = _HasSectorAccess.__name__
    return _HasSectorAccess


class IsOwnerOrAdmin(BasePermission):
    """Dono do objeto ou admin pode modificar."""
    message = 'Você não tem permissão para modificar este objeto.'

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.role == 'admin':
            return True
        # Verifica campos comuns de propriedade
        owner = getattr(obj, 'created_by', None) or getattr(obj, 'user', None)
        return owner == request.user

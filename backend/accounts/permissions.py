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
    """Somente parceiros de indicação."""
    message = 'Acesso restrito a parceiros.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'partner'
        )


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

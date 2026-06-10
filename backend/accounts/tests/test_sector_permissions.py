"""v32 F3 — testes unitários da HasSectorAccess (doc 08 §7.2)."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

from accounts.permissions import SECTOR_ACCESS_MATRIX, HasSectorAccess

User = get_user_model()

factory = APIRequestFactory()


def check(user, sector, method='GET'):
    permission_cls = HasSectorAccess(sector)
    request = getattr(factory, method.lower())('/fake/')
    request.user = user
    return permission_cls().has_permission(request, view=None)


def make_user(role, sectors=None, suffix=''):
    return User.objects.create_user(
        username=f'{role}{suffix}_sectorperm',
        email=f'{role}{suffix}@sectorperm.com',
        password='pass_sectorperm_123',
        role=role,
        sectors=sectors or [],
    )


@pytest.mark.django_db
class TestHasSectorAccess:
    def test_unknown_sector_raises(self):
        with pytest.raises(ValueError):
            HasSectorAccess('setor_inexistente')

    def test_admin_bypasses_matrix(self):
        admin = make_user('admin')
        for sector in SECTOR_ACCESS_MATRIX:
            assert check(admin, sector, 'GET')
            assert check(admin, sector, 'POST')

    def test_viewer_reads_everything_writes_nothing(self):
        viewer = make_user('viewer')
        for sector in SECTOR_ACCESS_MATRIX:
            assert check(viewer, sector, 'GET')
            assert not check(viewer, sector, 'POST')

    def test_operator_write_requires_own_sector(self):
        op = make_user('operator', sectors=['juridico'])
        assert check(op, 'juridico', 'POST')
        assert not check(op, 'comercial', 'POST')
        assert not check(op, 'financeiro', 'POST')

    def test_operator_read_follows_matrix(self):
        """Operador do suporte: LegalCase e n/a, mas Prospect e R."""
        op = make_user('operator', sectors=['suporte'])
        assert not check(op, 'juridico', 'GET')   # n/a na matriz
        assert check(op, 'comercial', 'GET')      # R
        assert check(op, 'producao', 'GET')       # R
        assert not check(op, 'diretoria', 'POST')

    def test_manager_same_rules_as_operator(self):
        mgr = make_user('manager', sectors=['financeiro'])
        assert check(mgr, 'financeiro', 'POST')
        assert not check(mgr, 'juridico', 'POST')
        assert check(mgr, 'juridico', 'GET')  # financeiro lê juridico (R)

    def test_partner_denied_everywhere(self):
        partner = make_user('partner', sectors=['juridico'])
        assert not check(partner, 'juridico', 'GET')
        assert not check(partner, 'juridico', 'POST')

    def test_empty_sectors_denied(self):
        op = make_user('operator', sectors=[], suffix='_empty')
        assert not check(op, 'juridico', 'GET')
        assert not check(op, 'juridico', 'POST')

    def test_custom_access_map_injectable(self):
        op = make_user('operator', sectors=['x'])
        custom = {'meu_setor': {'read': {'x'}, 'write': {'x'}}}
        permission_cls = HasSectorAccess('meu_setor', access_map=custom)
        request = factory.get('/fake/')
        request.user = op
        assert permission_cls().has_permission(request, view=None)

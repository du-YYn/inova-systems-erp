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

    def test_empty_sectors_reads_but_write_is_fail_closed(self):
        """SEC-002: manager/operator SEM sectors mantêm a LEITURA legada (não
        são trancados no deploy numa base de produção sem o campo preenchido),
        mas a ESCRITA é fail-closed (403) — sem setor não há interseção com
        write_set. Assim que John atribui `sectors`, a escrita por setor passa
        a valer (ver test_assigned_sector_overrides_fallback)."""
        op = make_user('operator', sectors=[], suffix='_empty_op')
        # leitura liberada em qualquer setor
        assert check(op, 'juridico', 'GET')
        assert check(op, 'comercial', 'GET')
        # escrita negada (fail-closed) — sem setor, sem escrita setorizada
        assert not check(op, 'juridico', 'POST')
        assert not check(op, 'comercial', 'POST')

        mgr = make_user('manager', sectors=[], suffix='_empty_mgr')
        assert check(mgr, 'financeiro', 'GET')
        assert not check(mgr, 'financeiro', 'POST')

    def test_empty_sectors_still_blocks_non_operator_roles(self):
        """O fallback é só para manager/operator. Viewer (leitura global) e
        partner (negado) mantêm suas regras mesmo sem sectors."""
        viewer = make_user('viewer', sectors=[], suffix='_empty_viewer')
        assert check(viewer, 'comercial', 'GET')
        assert not check(viewer, 'comercial', 'POST')
        partner = make_user('partner', sectors=[], suffix='_empty_partner')
        assert not check(partner, 'comercial', 'GET')
        assert not check(partner, 'comercial', 'POST')

    def test_assigned_sector_overrides_fallback(self):
        """Assim que o usuário recebe um setor, a regra por setor passa a valer
        (o fallback some) — escrita só no próprio setor."""
        op = make_user('operator', sectors=['juridico'], suffix='_assigned')
        assert check(op, 'juridico', 'POST')
        assert not check(op, 'comercial', 'POST')  # fallback não vale mais

    def test_custom_access_map_injectable(self):
        op = make_user('operator', sectors=['x'])
        custom = {'meu_setor': {'read': {'x'}, 'write': {'x'}}}
        permission_cls = HasSectorAccess('meu_setor', access_map=custom)
        request = factory.get('/fake/')
        request.user = op
        assert permission_cls().has_permission(request, view=None)

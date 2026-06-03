"""Testes de F6 — infra/deps/secrets hardening.

Estes testes parseiam os arquivos de config (nao executam infra real) para
travar regressoes nos hardenings aplicados. Roda em todo CI ja existente,
sem precisar de docker/nginx instalados.
"""
import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]


def _read(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text(encoding='utf-8')


# ─── backup_db.sh ────────────────────────────────────────────────────────────


class TestBackupScript:
    def setup_method(self):
        self.script = _read('scripts/backup_db.sh')

    def test_uses_pass_env_not_pass_pass(self):
        """openssl deve ler a key de env var, nao de cmdline (vaza em ps)."""
        # Olhamos apenas linhas nao-comentadas (codigo ativo).
        active = '\n'.join(
            line for line in self.script.splitlines()
            if not line.lstrip().startswith('#')
        )
        assert '-pass env:BACKUP_ENCRYPTION_KEY' in active
        assert '-pass pass:' not in active

    def test_fail_closed_when_key_missing(self):
        """Sem BACKUP_ENCRYPTION_KEY, script aborta em vez de gerar texto-plano."""
        assert 'BACKUP_ENCRYPTION_KEY' in self.script
        assert 'exit 1' in self.script
        # Nao deve ter branch que gera .sql.gz sem .enc
        assert '.sql.gz"' not in self.script or '.sql.gz.enc"' in self.script
        # O caminho do arquivo de backup tem que terminar em .enc
        match = re.search(r'BACKUP_FILE="\$BACKUP_DIR/[^"]+"', self.script)
        assert match is not None
        assert match.group(0).endswith('.sql.gz.enc"')


# ─── .env.example ────────────────────────────────────────────────────────────


class TestEnvExample:
    REQUIRED_VARS = (
        'WEBSITE_API_KEY',
        'N8N_API_KEY',
        'BACKUP_ENCRYPTION_KEY',
        'JWT_COOKIE_DOMAIN',
        'FRONTEND_URL',
        'TOTP_ENCRYPTION_KEY',
    )

    def setup_method(self):
        self.env = _read('.env.example')

    @pytest.mark.parametrize('var', REQUIRED_VARS)
    def test_var_documented(self, var):
        assert var in self.env, f'{var} ausente no .env.example'


# ─── nginx.conf.template ─────────────────────────────────────────────────────


class TestNginxConfig:
    def setup_method(self):
        self.conf = _read('nginx/nginx.conf.template')

    def test_server_tokens_off(self):
        assert re.search(r'\bserver_tokens\s+off\s*;', self.conf), \
            'server_tokens off ausente — vaza versao do nginx'

    def test_proxy_hides_powered_by_and_server(self):
        assert 'proxy_hide_header X-Powered-By' in self.conf
        assert 'proxy_hide_header Server' in self.conf

    def test_default_body_size_limited(self):
        # Default global = 1m; overrides explicitos em rotas de upload.
        assert re.search(r'^\s*client_max_body_size\s+1m\s*;', self.conf, re.M)

    def test_admin_has_rate_limit_and_geo_allowlist(self):
        # Zone admin_panel definida
        assert 'zone=admin_panel' in self.conf
        # Geo block definindo $admin_allowed
        assert 'geo $admin_allowed' in self.conf
        # /admin/ bloqueia por default + aplica limit_req. Capturamos do header
        # `location /admin/` ate o proximo `location` ou final do bloco server.
        admin_block = re.search(
            r'location /admin/\s*\{.*?(?=\n\s{4}(?:location|\}))',
            self.conf,
            re.S,
        )
        assert admin_block is not None, 'bloco location /admin/ nao encontrado'
        body = admin_block.group(0)
        assert '$admin_allowed = 0' in body
        assert 'return 403' in body
        assert 'limit_req zone=admin_panel' in body


# ─── docker-compose.yml ──────────────────────────────────────────────────────


class TestDockerCompose:
    def setup_method(self):
        self.compose = _read('docker-compose.yml')

    def test_postgres_pinned_by_digest(self):
        # Toda imagem postgres deve incluir @sha256:
        for match in re.finditer(r'image:\s*postgres:[^\s]+', self.compose):
            assert '@sha256:' in match.group(0), \
                f'imagem postgres sem digest: {match.group(0)}'

    def test_redis_pinned_by_digest(self):
        match = re.search(r'image:\s*redis:[^\s]+', self.compose)
        assert match is not None
        assert '@sha256:' in match.group(0), \
            'redis precisa estar pinado por sha256'

    def test_redis_healthcheck_uses_redislcli_auth_env(self):
        # Healthcheck do redis NAO deve passar -a $PASSWORD (vaza em ps).
        # Deve usar REDISCLI_AUTH como variavel de ambiente.
        # Recorta o bloco do servico redis
        redis_block = re.search(
            r'^\s{2}redis:\n(?:\s{4}.+\n)+', self.compose, re.M
        )
        assert redis_block is not None
        body = redis_block.group(0)
        assert 'REDISCLI_AUTH' in body
        # `-a $PASSWORD` no healthcheck é o anti-pattern
        assert 'redis-cli -a' not in body


# ─── GitHub Actions ──────────────────────────────────────────────────────────


class TestCIPinning:
    def setup_method(self):
        self.ci = _read('.github/workflows/ci.yml')

    def test_trufflehog_pinned_by_sha(self):
        # Deve usar sha hex 40 chars, nao @main / @master / @branch
        match = re.search(
            r'uses:\s*trufflesecurity/trufflehog@([a-f0-9]{40}|main|master|v[\d.]+)',
            self.ci,
        )
        assert match is not None, 'trufflehog action nao encontrada'
        ref = match.group(1)
        assert ref not in ('main', 'master'), \
            f'trufflehog pinada em ref mutavel: {ref}'
        assert re.fullmatch(r'[a-f0-9]{40}', ref), \
            f'trufflehog deve estar pinada em SHA hex 40 chars, encontrado: {ref}'


# ─── psycopg2 source build + Dockerfile ──────────────────────────────────────


class TestPsycopgSourceBuild:
    def test_requirements_uses_source_psycopg2(self):
        req = _read('backend/requirements.txt')
        # `psycopg2==` (sem -binary) deve estar presente; -binary nao.
        assert re.search(r'^psycopg2==', req, re.M), \
            'psycopg2 (source) deve estar em requirements'
        assert not re.search(r'^psycopg2-binary==', req, re.M), \
            'psycopg2-binary deve ter sido removido — use psycopg2 (source build)'

    def test_dockerfile_installs_libpq_dev(self):
        df = _read('backend/Dockerfile')
        assert 'libpq-dev' in df, \
            'Dockerfile precisa instalar libpq-dev para compilar psycopg2 do fonte'


# ─── .dockerignore ───────────────────────────────────────────────────────────


@pytest.mark.parametrize('ignore_path', [
    'backend/.dockerignore',
    'frontend/.dockerignore',
])
class TestDockerignoreExcludesDocs:
    def test_excludes_md_and_claude(self, ignore_path):
        content = _read(ignore_path)
        assert '*.md' in content, f'{ignore_path}: *.md nao listado'
        assert 'CLAUDE.md' in content, f'{ignore_path}: CLAUDE.md nao listado'

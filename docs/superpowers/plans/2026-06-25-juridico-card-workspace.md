# CRM Jurídico — Card vira Workspace · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o card do CRM Jurídico de "só Avançar" num workspace por etapa: checklist (modelos fixos + itens avulsos) + ferramentas (anexar documento, editar notas, link Autentique), nas 4 modalidades.

**Architecture:** Backend Django/DRF aditivo — nova tabela `legal_case_tasks` semeada por modelos fixos em código (idempotente: na criação via signal, na transição, e via comando de backfill para prod); `LegalCaseTaskViewSet` para o checklist + 3 `@action` no `LegalCaseViewSet` (upload-attachment, notes, autentique) que gravam evento/audit. Frontend Next.js reescreve o modal de detalhe da página `juridico/page.tsx` como workspace (componente `StageWorkspace`), com badge de progresso no card e `ConfirmDialog` de aviso (não bloqueia) ao Avançar.

**Tech Stack:** Python 3.11 · Django 4.2 · DRF · PostgreSQL · pytest · Next.js 14 · React 18 · TypeScript · Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-25-juridico-card-workspace-design.md`
**Branch:** `feat/juridico-card-workspace` (já criada)

---

## Convenções deste plano

- Backend rodado de `backend/` (`cd backend`). Testes: `pytest <arquivo>::<classe>::<teste> -v`.
- Frontend rodado de `frontend/` (`cd frontend`). Gate: `npx tsc --noEmit`.
- Todos os testes novos do backend vivem em `backend/juridico/tests/test_workspace.py`.
- Migrations **só aditivas** (ERP em produção). Nunca alterar coluna existente.

## File Structure

**Backend (`backend/juridico/`):**
- `models.py` — **modificar**: novo model `LegalCaseTask`; novo choice `('document','Documento')` em `LegalCaseEvent.EVENT_TYPE_CHOICES`.
- `checklists.py` — **criar**: `CHECKLIST_TEMPLATES` + `seed_stage_tasks()`.
- `signals.py` — **modificar**: receiver `seed_tasks_on_create` (post_save LegalCase).
- `views.py` — **modificar**: semear na `transition`; novo `LegalCaseTaskViewSet`; 3 actions.
- `serializers.py` — **modificar**: `LegalCaseTaskSerializer`; campo `tasks` no `LegalCaseSerializer`.
- `urls.py` — **modificar**: registrar `legal-case-tasks`.
- `admin.py` — **modificar**: registrar `LegalCaseTask` (inline no caso).
- `management/commands/seed_legal_case_tasks.py` — **criar**: backfill.
- `migrations/000X_*.py` — **criar** (via makemigrations).
- `tests/test_workspace.py` — **criar**: todos os testes novos.

**Frontend (`frontend/app/(dashboard)/juridico/`):**
- `types.ts` — **criar**: interface `LegalCaseTask` (compartilhada por `page.tsx` e `StageWorkspace.tsx`).
- `StageWorkspace.tsx` — **criar**: a Zona 1 (etapa atual: checklist + 3 ferramentas).
- `page.tsx` — **modificar**: importar `LegalCaseTask`, `tasks`/`attachment` no `LegalCase`, handlers, integrar `StageWorkspace`, painéis recolhíveis, badge no card, `ConfirmDialog` no Avançar.

---

## Task 1: Model `LegalCaseTask` + evento `document` + migration

**Files:**
- Modify: `backend/juridico/models.py`
- Modify: `backend/juridico/admin.py`
- Test: `backend/juridico/tests/test_workspace.py`
- Create: `backend/juridico/migrations/000X_legalcasetask.py` (via makemigrations)

- [ ] **Step 1: Write the failing test**

Criar `backend/juridico/tests/test_workspace.py` com o cabeçalho de fixtures (reusa o padrão de `test_f3_juridico.py`) e o primeiro teste:

```python
"""Workspace do card do Jurídico — checklist por etapa + ferramentas."""
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from juridico.models import LegalCase, LegalCaseTask
from sales.models import Customer

User = get_user_model()

URL = '/api/v1/juridico/legal-cases/'
TASK_URL = '/api/v1/juridico/legal-case-tasks/'


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_ws', email='admin@ws.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def juridico_operator(db):
    return User.objects.create_user(
        username='juridico_ws', email='juridico@ws.com',
        password='juridico_pass_123', role='operator', sectors=['juridico'],
    )


@pytest.fixture
def comercial_operator(db):
    return User.objects.create_user(
        username='comercial_ws', email='comercial@ws.com',
        password='comercial_pass_123', role='operator', sectors=['comercial'],
    )


@pytest.fixture
def suporte_operator(db):
    return User.objects.create_user(
        username='suporte_ws', email='suporte@ws.com',
        password='suporte_pass_123', role='operator', sectors=['suporte'],
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def juridico_client(juridico_operator):
    return client_for(juridico_operator)


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente Workspace LTDA',
        email='cliente@ws.com', created_by=admin_user,
    )


def make_case(customer, user=None, **kwargs):
    defaults = dict(
        customer=customer, process_type='contrato',
        source='comercial', created_by=user,
    )
    defaults.update(kwargs)
    return LegalCase.objects.create(**defaults)


@pytest.mark.django_db
class TestLegalCaseTaskModel:
    def test_defaults(self, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(
            case=case, stage='envio_assinatura', label='Conferir documento',
        )
        assert task.done is False
        assert task.done_at is None
        assert task.done_by is None
        assert task.is_custom is False
        assert task.order == 0
        assert case.tasks.filter(stage='envio_assinatura').count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestLegalCaseTaskModel -v`
Expected: FAIL — `ImportError: cannot import name 'LegalCaseTask'`.

- [ ] **Step 3: Add the model + event choice**

Em `backend/juridico/models.py`, dentro de `LegalCaseEvent.EVENT_TYPE_CHOICES`, adicionar a linha `('document', 'Documento')`:

```python
    EVENT_TYPE_CHOICES = [
        ('created', 'Caso criado'),
        ('status_change', 'Mudança de status'),
        ('modality_change', 'Mudança de modalidade'),
        ('signed', 'Documento assinado'),
        ('rejected', 'Documento recusado'),
        ('linked', 'Vínculo atualizado'),
        ('document', 'Documento'),
    ]
```

No fim do arquivo `backend/juridico/models.py`, adicionar o model:

```python
class LegalCaseTask(models.Model):
    """Item de checklist por etapa de um LegalCase (workspace do card, doc 02 §2).

    Vem de modelo fixo (`is_custom=False`, semeado por etapa) ou é avulso
    (`is_custom=True`, adicionado pelo jurídico naquele card). Não bloqueia o
    avanço — só orienta. A conclusão guarda quem/quando.
    """
    case = models.ForeignKey(
        LegalCase, on_delete=models.CASCADE, related_name='tasks',
    )
    stage = models.CharField(
        max_length=30, help_text='Status/etapa a que a tarefa pertence',
    )
    label = models.CharField(max_length=255)
    done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='completed_legal_case_tasks',
    )
    order = models.PositiveIntegerField(default=0)
    is_custom = models.BooleanField(
        default=False, help_text='False = veio do modelo; True = avulsa',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'legal_case_tasks'
        ordering = ['stage', 'order', 'id']
        indexes = [models.Index(fields=['case', 'stage'])]

    def __str__(self):
        mark = '✓' if self.done else '○'
        return f'{mark} {self.label} (caso #{self.case_id})'
```

- [ ] **Step 4: Register in admin**

Em `backend/juridico/admin.py`, adicionar import e inline. Trocar a linha de import:

```python
from .models import LegalCase, LegalCaseEvent, LegalCaseTask
```

Adicionar a inline e incluí-la no `LegalCaseAdmin`:

```python
class LegalCaseTaskInline(admin.TabularInline):
    model = LegalCaseTask
    extra = 0
    fields = ('stage', 'label', 'done', 'done_by', 'order', 'is_custom')
    raw_id_fields = ('done_by',)
```

E em `LegalCaseAdmin`, trocar `inlines = [LegalCaseEventInline]` por:

```python
    inlines = [LegalCaseTaskInline, LegalCaseEventInline]
```

- [ ] **Step 5: Create the migration**

Run: `cd backend && python manage.py makemigrations juridico`
Expected: cria `juridico/migrations/0003_legalcasetask*.py` (nova tabela + alteração do choice de evento). Conferir que NÃO altera colunas existentes (só `AddField`/`CreateModel`/`AlterField` no choice).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestLegalCaseTaskModel -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/juridico/models.py backend/juridico/admin.py backend/juridico/migrations/ backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): model LegalCaseTask + evento document (workspace do card)"
```

---

## Task 2: Modelos fixos de checklist + `seed_stage_tasks`

**Files:**
- Create: `backend/juridico/checklists.py`
- Test: `backend/juridico/tests/test_workspace.py`

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `backend/juridico/tests/test_workspace.py`:

```python
from juridico.checklists import CHECKLIST_TEMPLATES, seed_stage_tasks


@pytest.mark.django_db
class TestSeedStageTasks:
    def test_seeds_template_for_a_non_current_stage(self, customer):
        # Usa 'assinado' (não é a etapa atual) p/ não colidir com o signal de criação.
        case = make_case(customer)
        created = seed_stage_tasks(case, 'assinado')
        labels = list(case.tasks.filter(stage='assinado').values_list('label', flat=True))
        assert labels == CHECKLIST_TEMPLATES[('contrato', 'assinado')]
        assert len(created) == len(labels)
        assert all(t.is_custom is False for t in created)

    def test_idempotent(self, customer):
        case = make_case(customer)
        seed_stage_tasks(case, 'assinado')
        seed_stage_tasks(case, 'assinado')
        assert case.tasks.filter(stage='assinado').count() == \
            len(CHECKLIST_TEMPLATES[('contrato', 'assinado')])

    def test_unknown_combo_creates_nothing(self, customer):
        case = make_case(customer, process_type='encerramento')
        created = seed_stage_tasks(case, 'aprovado_dev')  # não existe p/ encerramento
        assert created == []
        assert case.tasks.filter(stage='aprovado_dev').count() == 0

    def test_does_not_touch_existing_custom_items(self, customer):
        case = make_case(customer)
        LegalCaseTask.objects.create(
            case=case, stage='envio_assinatura', label='Pendência X', is_custom=True,
        )
        seed_stage_tasks(case, 'envio_assinatura')  # já existe item nessa etapa → no-op
        assert case.tasks.filter(stage='envio_assinatura').count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestSeedStageTasks -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'juridico.checklists'`.

- [ ] **Step 3: Create `checklists.py`**

Criar `backend/juridico/checklists.py`:

```python
"""Modelos fixos de checklist por (process_type, stage) + semeadura idempotente.

Conteúdo derivado do doc 02 §2 e doc 09 §06/07. Fixo em código (não configurável
por admin nesta fase). As tarefas semeadas têm is_custom=False; itens avulsos
(is_custom=True) são adicionados pelo jurídico no card.
"""
from .models import LegalCaseTask

CHECKLIST_TEMPLATES = {
    # ── Contrato ──────────────────────────────────────────────────────────────
    ('contrato', 'preparacao'): [
        'Elaborar a minuta do contrato',
        'Anexar o documento no card',
        'Subir o documento no Autentique',
    ],
    ('contrato', 'envio_assinatura'): [
        'Enviar ao cliente para assinatura',
        'Confirmar que o cliente recebeu',
    ],
    ('contrato', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('contrato', 'assinado'): [
        'Confirmar o documento assinado',
        'Conferir o link do documento assinado',
    ],
    # ── Validação de Documento ────────────────────────────────────────────────
    ('validacao_documento', 'preparacao'): [
        'Conferir o documento recebido da Produção',
        'Anexar o termo no card',
        'Subir o documento no Autentique',
    ],
    ('validacao_documento', 'envio_assinatura'): [
        'Enviar ao cliente para validação/assinatura',
    ],
    ('validacao_documento', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('validacao_documento', 'assinado'): [
        'Confirmar o documento assinado',
    ],
    ('validacao_documento', 'aprovado_dev'): [
        'Liberar para Desenvolvimento',
    ],
    # ── Aditivo ───────────────────────────────────────────────────────────────
    ('aditivo', 'nova_solicitacao'): [
        'Revisar a Solicitação de Mudança (escopo + valor)',
        'Confirmar o valor do aditivo',
    ],
    ('aditivo', 'preparacao'): [
        'Elaborar o aditivo',
        'Anexar o documento no card',
        'Subir no Autentique e enviar ao cliente',
    ],
    ('aditivo', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('aditivo', 'assinado'): [
        'Confirmar o documento assinado',
    ],
    ('aditivo', 'recusado'): [
        'Registrar o motivo da recusa',
    ],
    # ── Encerramento ──────────────────────────────────────────────────────────
    ('encerramento', 'preparacao'): [
        'Analisar pendências do cliente',
        'Elaborar o distrato',
    ],
    ('encerramento', 'envio_assinatura'): [
        'Enviar o distrato para assinatura',
    ],
    ('encerramento', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('encerramento', 'assinado'): [
        'Confirmar o encerramento assinado',
    ],
}


def seed_stage_tasks(case, stage):
    """Cria as tarefas-modelo de (case.process_type, stage) se ainda não existirem.

    Idempotente: se já há QUALQUER tarefa para aquele (case, stage), não faz nada
    (preserva marcações e itens avulsos). Retorna a lista de tarefas criadas.
    """
    if case.tasks.filter(stage=stage).exists():
        return []
    labels = CHECKLIST_TEMPLATES.get((case.process_type, stage), [])
    return [
        LegalCaseTask.objects.create(
            case=case, stage=stage, label=label, order=i, is_custom=False,
        )
        for i, label in enumerate(labels)
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestSeedStageTasks -v`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/juridico/checklists.py backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): modelos fixos de checklist + seed_stage_tasks idempotente"
```

---

## Task 3: Semear na criação (signal) e na transição

**Files:**
- Modify: `backend/juridico/signals.py`
- Modify: `backend/juridico/views.py:159-170` (dentro de `transition`, após `record_event`)
- Test: `backend/juridico/tests/test_workspace.py`

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `backend/juridico/tests/test_workspace.py`:

```python
@pytest.mark.django_db
class TestSeedingWiring:
    def test_create_seeds_initial_stage(self, customer):
        case = make_case(customer)  # post_save → semeia 'preparacao'
        labels = list(case.tasks.filter(stage='preparacao').values_list('label', flat=True))
        assert labels == CHECKLIST_TEMPLATES[('contrato', 'preparacao')]

    def test_transition_seeds_new_stage(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'envio_assinatura'})
        assert resp.status_code == status.HTTP_200_OK, resp.data
        case.refresh_from_db()
        assert case.tasks.filter(stage='envio_assinatura').count() == \
            len(CHECKLIST_TEMPLATES[('contrato', 'envio_assinatura')])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestSeedingWiring -v`
Expected: FAIL — `test_create_seeds_initial_stage` falha (0 tarefas; o signal ainda não existe).

- [ ] **Step 3: Add the creation signal**

Em `backend/juridico/signals.py`, ao final do arquivo, adicionar:

```python
@receiver(
    post_save, sender='juridico.LegalCase',
    dispatch_uid='juridico_seed_stage_tasks',
)
def seed_tasks_on_create(sender, instance, created, **kwargs):
    """Ao criar um LegalCase (qualquer origem), semeia o checklist da etapa inicial."""
    if not created:
        return
    from .checklists import seed_stage_tasks
    try:
        seed_stage_tasks(instance, instance.status)
    except Exception as exc:  # noqa: BLE001 — isolamento de signal
        logger.exception(
            'Falha ao semear tarefas do LegalCase %s: %s', instance.id, exc,
        )
```

- [ ] **Step 4: Seed on transition**

Em `backend/juridico/views.py`, dentro de `transition`, logo **após** o bloco `case.record_event(...)` (o que grava a timeline da transição) e **antes** de `self._handle_transition_outputs(...)`, inserir:

```python
        # Semeia o checklist da nova etapa (idempotente).
        from .checklists import seed_stage_tasks
        try:
            seed_stage_tasks(case, new_status)
        except Exception as exc:  # noqa: BLE001 — não derruba a transição
            logger.exception(
                'Falha ao semear tarefas (LegalCase %s, etapa %s): %s',
                case.id, new_status, exc,
            )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestSeedingWiring -v`
Expected: PASS (2 testes).

- [ ] **Step 6: Run the full juridico suite (no regression)**

Run: `cd backend && pytest juridico/ -q`
Expected: todos PASS (os testes legados não contam `tasks`, então a semeadura não os quebra).

- [ ] **Step 7: Commit**

```bash
git add backend/juridico/signals.py backend/juridico/views.py backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): semeia checklist na criação (signal) e na transição"
```

---

## Task 4: Serializer expõe `tasks`

**Files:**
- Modify: `backend/juridico/serializers.py`
- Test: `backend/juridico/tests/test_workspace.py`

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `backend/juridico/tests/test_workspace.py`:

```python
@pytest.mark.django_db
class TestCaseSerializerTasks:
    def test_case_detail_includes_tasks(self, juridico_client, customer):
        case = make_case(customer)  # semeado em 'preparacao'
        resp = juridico_client.get(f'{URL}{case.id}/')
        assert resp.status_code == status.HTTP_200_OK
        stages = {t['stage'] for t in resp.data['tasks']}
        assert 'preparacao' in stages
        first = resp.data['tasks'][0]
        assert first['done'] is False
        assert first['is_custom'] is False
        assert 'done_by_name' in first
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestCaseSerializerTasks -v`
Expected: FAIL — `KeyError: 'tasks'`.

- [ ] **Step 3: Add the serializer + field**

Em `backend/juridico/serializers.py`, trocar o import dos models:

```python
from .models import LegalCase, LegalCaseEvent, LegalCaseTask
```

Adicionar a classe `LegalCaseTaskSerializer` (antes de `LegalCaseSerializer`):

```python
class LegalCaseTaskSerializer(serializers.ModelSerializer):
    """Item de checklist do card (workspace). Usado nested (read) e no viewset (write)."""
    done_by_name = serializers.SerializerMethodField(read_only=True)
    stage = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = LegalCaseTask
        fields = [
            'id', 'case', 'stage', 'label', 'done', 'done_at', 'done_by',
            'done_by_name', 'order', 'is_custom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'done_at', 'done_by', 'done_by_name', 'order', 'is_custom',
            'created_at', 'updated_at',
        ]

    def get_done_by_name(self, obj):
        return obj.done_by.full_name if obj.done_by else ''
```

Em `LegalCaseSerializer`, adicionar o campo nested junto de `events`:

```python
    events = LegalCaseEventSerializer(many=True, read_only=True)
    tasks = LegalCaseTaskSerializer(many=True, read_only=True)
```

E incluir `'tasks'` na lista `fields` do `LegalCaseSerializer.Meta` (logo após `'events'`):

```python
            'events', 'tasks', 'created_at', 'updated_at',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestCaseSerializerTasks -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/juridico/serializers.py backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): serializer do caso expõe tasks (checklist)"
```

---

## Task 5: `LegalCaseTaskViewSet` (CRUD do checklist)

**Files:**
- Modify: `backend/juridico/views.py`
- Modify: `backend/juridico/urls.py`
- Test: `backend/juridico/tests/test_workspace.py`

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `backend/juridico/tests/test_workspace.py`:

```python
@pytest.mark.django_db
class TestLegalCaseTaskViewSet:
    def test_list_filtered_by_case_returns_plain_list(self, juridico_client, customer):
        case = make_case(customer)  # semeado preparacao
        resp = juridico_client.get(TASK_URL, {'case': case.id})
        assert resp.status_code == status.HTTP_200_OK
        assert isinstance(resp.data, list)
        assert len(resp.data) >= 1

    def test_create_custom_task_defaults_to_current_stage(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(TASK_URL, {'case': case.id, 'label': 'Pendência extra'})
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        task = LegalCaseTask.objects.get(id=resp.data['id'])
        assert task.is_custom is True
        assert task.stage == 'preparacao'
        assert task.done is False

    def test_toggle_done_sets_done_by_and_at(self, juridico_client, juridico_operator, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        resp = juridico_client.patch(f'{TASK_URL}{task.id}/', {'done': True})
        assert resp.status_code == status.HTTP_200_OK
        task.refresh_from_db()
        assert task.done is True
        assert task.done_at is not None
        assert task.done_by == juridico_operator

    def test_untoggle_clears_done(self, juridico_client, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X', done=True)
        resp = juridico_client.patch(f'{TASK_URL}{task.id}/', {'done': False})
        assert resp.status_code == status.HTTP_200_OK
        task.refresh_from_db()
        assert task.done is False
        assert task.done_at is None
        assert task.done_by is None

    def test_delete_task(self, juridico_client, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        resp = juridico_client.delete(f'{TASK_URL}{task.id}/')
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not LegalCaseTask.objects.filter(id=task.id).exists()

    def test_comercial_reads_but_cannot_write(self, comercial_operator, customer):
        client = client_for(comercial_operator)
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        assert client.get(TASK_URL, {'case': case.id}).status_code == status.HTTP_200_OK
        assert client.post(TASK_URL, {'case': case.id, 'label': 'Y'}).status_code == status.HTTP_403_FORBIDDEN
        assert client.patch(f'{TASK_URL}{task.id}/', {'done': True}).status_code == status.HTTP_403_FORBIDDEN

    def test_suporte_has_no_access(self, suporte_operator, customer):
        client = client_for(suporte_operator)
        case = make_case(customer)
        assert client.get(TASK_URL, {'case': case.id}).status_code == status.HTTP_403_FORBIDDEN
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestLegalCaseTaskViewSet -v`
Expected: FAIL — 404 (rota `legal-case-tasks` não existe).

- [ ] **Step 3: Add the viewset**

Em `backend/juridico/views.py`, atualizar imports e adicionar o viewset. Trocar a linha de import dos serializers/models:

```python
from .models import LegalCase, LegalCaseTask
from .serializers import (
    LegalCaseSerializer, LegalCaseTaskSerializer, LegalCaseTransitionSerializer,
)
```

Ao final do arquivo, adicionar:

```python
@extend_schema(tags=['juridico'])
class LegalCaseTaskViewSet(viewsets.ModelViewSet):
    """Checklist por etapa do card (workspace). Itens criados via POST são avulsos."""
    queryset = LegalCaseTask.objects.select_related('case', 'done_by')
    serializer_class = LegalCaseTaskSerializer
    permission_classes = [HasSectorAccess('juridico')]
    pagination_class = None  # lista plana — o front consome direto

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('case'):
            qs = qs.filter(case_id=params['case'])
        if params.get('stage'):
            qs = qs.filter(stage=params['stage'])
        return qs

    def perform_create(self, serializer):
        case = serializer.validated_data['case']
        stage = serializer.validated_data.get('stage') or case.status
        last = case.tasks.filter(stage=stage).order_by('-order').first()
        order = (last.order + 1) if last else 0
        serializer.save(is_custom=True, stage=stage, order=order)

    def perform_update(self, serializer):
        was_done = serializer.instance.done
        task = serializer.save()
        if task.done and not was_done:
            task.done_at = timezone.now()
            task.done_by = self.request.user
            task.save(update_fields=['done_at', 'done_by', 'updated_at'])
        elif not task.done and was_done:
            task.done_at = None
            task.done_by = None
            task.save(update_fields=['done_at', 'done_by', 'updated_at'])
```

- [ ] **Step 4: Register the route**

Em `backend/juridico/urls.py`, trocar import e registrar:

```python
from .views import LegalCaseViewSet, LegalCaseTaskViewSet

router = DefaultRouter()
router.register(r'legal-cases', LegalCaseViewSet)
router.register(r'legal-case-tasks', LegalCaseTaskViewSet)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestLegalCaseTaskViewSet -v`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/juridico/views.py backend/juridico/urls.py backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): LegalCaseTaskViewSet (CRUD do checklist + RBAC por setor)"
```

---

## Task 6: Ferramentas — `upload-attachment`, `notes`, `autentique`

**Files:**
- Modify: `backend/juridico/views.py`
- Test: `backend/juridico/tests/test_workspace.py`

- [ ] **Step 1: Confirmar extensões permitidas**

Run: `cd backend && python -c "import core.validators as v, inspect; print(inspect.getsource(v.validate_file_extension))"`
Expected: ver a lista de extensões aceitas. Garantir que `.pdf` está na lista e `.exe` não. Se `.pdf` não estiver, ajustar o nome do arquivo nos testes abaixo para uma extensão permitida (ex.: `.docx`).

- [ ] **Step 2: Write the failing test**

Adicionar ao final de `backend/juridico/tests/test_workspace.py`:

```python
@pytest.mark.django_db
class TestWorkspaceTools:
    def test_upload_attachment(self, juridico_client, customer):
        case = make_case(customer)
        f = SimpleUploadedFile('minuta.pdf', b'%PDF-1.4 conteudo', content_type='application/pdf')
        resp = juridico_client.post(
            f'{URL}{case.id}/upload-attachment/', {'attachment': f}, format='multipart',
        )
        assert resp.status_code == status.HTTP_200_OK, resp.data
        case.refresh_from_db()
        assert case.attachment.name
        assert case.events.filter(event_type='document').exists()
        assert AuditLog.objects.filter(
            action='legal_case_attachment', resource_id=str(case.id),
        ).exists()

    def test_upload_attachment_rejects_bad_extension(self, juridico_client, customer):
        case = make_case(customer)
        f = SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream')
        resp = juridico_client.post(
            f'{URL}{case.id}/upload-attachment/', {'attachment': f}, format='multipart',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_attachment_requires_file(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(f'{URL}{case.id}/upload-attachment/', {}, format='multipart')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_notes(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(f'{URL}{case.id}/notes/', {'notes': 'Revisar cláusula 5'})
        assert resp.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert case.notes == 'Revisar cláusula 5'
        assert AuditLog.objects.filter(
            action='legal_case_notes', resource_id=str(case.id),
        ).exists()

    def test_set_autentique(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(f'{URL}{case.id}/autentique/', {
            'autentique_id': 'abc123',
            'autentique_link': 'https://app.autentique.com.br/d/abc123',
        })
        assert resp.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert case.autentique_id == 'abc123'
        assert case.autentique_link == 'https://app.autentique.com.br/d/abc123'
        assert case.events.filter(event_type='document').exists()

    def test_comercial_cannot_use_tools(self, comercial_operator, customer):
        client = client_for(comercial_operator)
        case = make_case(customer)
        resp = client.post(f'{URL}{case.id}/notes/', {'notes': 'x'})
        assert resp.status_code == status.HTTP_403_FORBIDDEN
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestWorkspaceTools -v`
Expected: FAIL — 404 (actions ainda não existem).

- [ ] **Step 4: Add the three actions**

Em `backend/juridico/views.py`, no topo, adicionar imports:

```python
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.parsers import FormParser, MultiPartParser

from core.validators import validate_file_extension, validate_file_size
```

Dentro de `LegalCaseViewSet`, adicionar as três actions (após `_handle_transition_outputs`):

```python
    @action(
        detail=True, methods=['post'],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachment(self, request, pk=None):
        """Anexa/troca a minuta no card (campo attachment). Grava evento + audit."""
        case = self.get_object()
        file = request.FILES.get('attachment')
        if not file:
            return Response(
                {'error': 'Arquivo (attachment) é obrigatório.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_file_extension(file)
            validate_file_size(file)
        except DjangoValidationError as exc:
            return Response({'error': exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        case.attachment = file
        case.save(update_fields=['attachment', 'updated_at'])
        case.record_event(
            'document',
            description=f'Documento anexado: {case.attachment.name}',
            created_by=request.user,
        )
        log_audit(
            request.user, 'legal_case_attachment', 'legal_case', case.id,
            details=f'Anexo {case.attachment.name}', request=request,
        )
        return Response(LegalCaseSerializer(case).data)

    @action(detail=True, methods=['post'])
    def notes(self, request, pk=None):
        """Atualiza as notas do jurídico no card."""
        case = self.get_object()
        old = case.notes
        case.notes = request.data.get('notes', '')
        case.save(update_fields=['notes', 'updated_at'])
        log_audit(
            request.user, 'legal_case_notes', 'legal_case', case.id,
            old_value={'notes': old}, new_value={'notes': case.notes}, request=request,
        )
        return Response(LegalCaseSerializer(case).data)

    @action(detail=True, methods=['post'])
    def autentique(self, request, pk=None):
        """Informa/corrige o id + link do Autentique fora da transição."""
        case = self.get_object()
        case.autentique_id = request.data.get('autentique_id', case.autentique_id)
        case.autentique_link = request.data.get('autentique_link', case.autentique_link)
        case.save(update_fields=['autentique_id', 'autentique_link', 'updated_at'])
        case.record_event(
            'document', autentique_link=case.autentique_link,
            description='Link do Autentique atualizado', created_by=request.user,
        )
        log_audit(
            request.user, 'legal_case_autentique', 'legal_case', case.id,
            new_value={
                'autentique_id': case.autentique_id,
                'autentique_link': case.autentique_link,
            },
            request=request,
        )
        return Response(LegalCaseSerializer(case).data)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestWorkspaceTools -v`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/juridico/views.py backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): actions upload-attachment, notes e autentique (ferramentas do card)"
```

---

## Task 7: Comando de backfill `seed_legal_case_tasks`

**Files:**
- Create: `backend/juridico/management/__init__.py`
- Create: `backend/juridico/management/commands/__init__.py`
- Create: `backend/juridico/management/commands/seed_legal_case_tasks.py`
- Test: `backend/juridico/tests/test_workspace.py`

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `backend/juridico/tests/test_workspace.py`:

```python
@pytest.mark.django_db
class TestBackfillCommand:
    def test_command_seeds_legacy_case(self, customer):
        # Simula caso legado (sem tarefas): cria e apaga as semeadas pelo signal.
        case = make_case(customer)
        case.tasks.all().delete()
        call_command('seed_legal_case_tasks')
        assert case.tasks.filter(stage='preparacao').count() == \
            len(CHECKLIST_TEMPLATES[('contrato', 'preparacao')])

    def test_command_idempotent(self, customer):
        case = make_case(customer)  # já semeado pelo signal
        before = case.tasks.count()
        call_command('seed_legal_case_tasks')
        assert case.tasks.count() == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestBackfillCommand -v`
Expected: FAIL — `CommandError: Unknown command: 'seed_legal_case_tasks'`.

- [ ] **Step 3: Create the command package + file**

Criar `backend/juridico/management/__init__.py` (vazio) e `backend/juridico/management/commands/__init__.py` (vazio).

Criar `backend/juridico/management/commands/seed_legal_case_tasks.py`:

```python
"""Backfill: semeia o checklist da etapa atual dos LegalCases existentes.

Idempotente (seguro reexecutar). Rodar 1× no deploy para os cards já em produção
ganharem o checklist da sua etapa corrente.
"""
from django.core.management.base import BaseCommand

from juridico.checklists import seed_stage_tasks
from juridico.models import LegalCase


class Command(BaseCommand):
    help = 'Semeia o checklist da etapa atual dos LegalCases existentes (idempotente).'

    def handle(self, *args, **options):
        cases_touched = 0
        created_total = 0
        for case in LegalCase.objects.all().iterator():
            created = seed_stage_tasks(case, case.status)
            if created:
                cases_touched += 1
                created_total += len(created)
        self.stdout.write(self.style.SUCCESS(
            f'Semeadura concluída: {created_total} tarefas em {cases_touched} casos.'
        ))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest juridico/tests/test_workspace.py::TestBackfillCommand -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Run the whole backend suite + coverage gate**

Run: `cd backend && pytest --cov=juridico --cov-report=term-missing -q`
Expected: todos PASS; cobertura de `juridico/` ≥ 70%.

- [ ] **Step 6: Commit**

```bash
git add backend/juridico/management/ backend/juridico/tests/test_workspace.py
git commit -m "feat(juridico): comando seed_legal_case_tasks (backfill dos cards em prod)"
```

---

## Task 8: Frontend — tipos + handlers

**Files:**
- Modify: `frontend/app/(dashboard)/juridico/page.tsx`

- [ ] **Step 1: Criar o tipo compartilhado + referenciar no `LegalCase`**

Criar `frontend/app/(dashboard)/juridico/types.ts`:

```tsx
export interface LegalCaseTask {
  id: number;
  case: number;
  stage: string;
  label: string;
  done: boolean;
  done_at: string | null;
  done_by: number | null;
  done_by_name: string;
  order: number;
  is_custom: boolean;
}
```

Em `frontend/app/(dashboard)/juridico/page.tsx`, importar o tipo (junto dos outros imports):

```tsx
import type { LegalCaseTask } from './types';
```

E na interface `LegalCase`, adicionar dois campos (após `events: LegalCaseEvent[];`):

```tsx
  attachment: string | null;
  tasks: LegalCaseTask[];
```

- [ ] **Step 2: Add the handlers**

Dentro do componente `JuridicoPage`, após `applyUpdated`, adicionar os handlers (todos com try/catch + toast):

```tsx
  // ── Checklist (LegalCaseTask) ──────────────────────────────────────────────
  const patchDetailTasks = (mut: (tasks: LegalCaseTask[]) => LegalCaseTask[]) =>
    setDetailCase((prev) => (prev ? { ...prev, tasks: mut(prev.tasks) } : prev));

  const toggleTask = async (task: LegalCaseTask) => {
    try {
      const updated = await api.patch<LegalCaseTask>(
        `/juridico/legal-case-tasks/${task.id}/`, { done: !task.done },
      );
      patchDetailTasks((tasks) => tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error('Não foi possível atualizar a tarefa.');
    }
  };

  const addTask = async (caseId: number, label: string) => {
    if (!label.trim()) return;
    try {
      const created = await api.post<LegalCaseTask>(
        '/juridico/legal-case-tasks/', { case: caseId, label: label.trim() },
      );
      patchDetailTasks((tasks) => [...tasks, created]);
    } catch {
      toast.error('Não foi possível adicionar a tarefa.');
    }
  };

  const removeTask = async (task: LegalCaseTask) => {
    try {
      await api.delete(`/juridico/legal-case-tasks/${task.id}/`);
      patchDetailTasks((tasks) => tasks.filter((t) => t.id !== task.id));
    } catch {
      toast.error('Não foi possível remover a tarefa.');
    }
  };

  // ── Ferramentas (documento / notas / autentique) ───────────────────────────
  const uploadAttachment = async (caseId: number, file: File) => {
    try {
      const updated = await api.upload<LegalCase>(
        `/juridico/legal-cases/${caseId}/upload-attachment/`, file, 'attachment',
      );
      applyUpdated(updated);
      toast.success('Documento anexado.');
    } catch {
      toast.error('Falha ao anexar o documento (verifique tipo/tamanho).');
    }
  };

  const saveNotes = async (caseId: number, notes: string) => {
    try {
      const updated = await api.post<LegalCase>(
        `/juridico/legal-cases/${caseId}/notes/`, { notes },
      );
      applyUpdated(updated);
      toast.success('Notas salvas.');
    } catch {
      toast.error('Não foi possível salvar as notas.');
    }
  };

  const saveAutentique = async (caseId: number, autentiqueId: string, autentiqueLink: string) => {
    try {
      const updated = await api.post<LegalCase>(
        `/juridico/legal-cases/${caseId}/autentique/`,
        { autentique_id: autentiqueId, autentique_link: autentiqueLink },
      );
      applyUpdated(updated);
      toast.success('Link do Autentique atualizado.');
    } catch {
      toast.error('Não foi possível atualizar o link.');
    }
  };
```

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros novos. (Os handlers ainda não são usados — `eslint` pode acusar unused; se o build falhar por isso, seguem usados no Task 10. Use `npx tsc --noEmit` como gate aqui, não o lint.)

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(dashboard)/juridico/page.tsx"
git commit -m "feat(juridico-ui): tipos LegalCaseTask + handlers de checklist e ferramentas"
```

---

## Task 9: Frontend — componente `StageWorkspace`

**Files:**
- Create: `frontend/app/(dashboard)/juridico/StageWorkspace.tsx`

- [ ] **Step 1: Create the component**

Criar `frontend/app/(dashboard)/juridico/StageWorkspace.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import {
  Check, Plus, X, Paperclip, PenLine, Link2, ExternalLink, Download,
} from 'lucide-react';
import type { LegalCaseTask } from './types';

interface StageWorkspaceProps {
  stageLabel: string;
  tasks: LegalCaseTask[];           // já filtradas para a etapa atual
  attachmentUrl: string | null;
  notes: string;
  autentiqueId: string;
  autentiqueLink: string;
  onToggle: (task: LegalCaseTask) => void;
  onAdd: (label: string) => void;
  onRemove: (task: LegalCaseTask) => void;
  onUpload: (file: File) => void;
  onSaveNotes: (notes: string) => void;
  onSaveAutentique: (id: string, link: string) => void;
}

export default function StageWorkspace({
  stageLabel, tasks, attachmentUrl, notes, autentiqueId, autentiqueLink,
  onToggle, onAdd, onRemove, onUpload, onSaveNotes, onSaveAutentique,
}: StageWorkspaceProps) {
  const [newTask, setNewTask] = useState('');
  const [openTool, setOpenTool] = useState<null | 'notes' | 'autentique'>(null);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [aId, setAId] = useState(autentiqueId);
  const [aLink, setALink] = useState(autentiqueLink);
  const fileRef = useRef<HTMLInputElement>(null);

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="mx-1 mb-5 rounded-xl border border-accent-gold/30 bg-accent-gold/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-wide text-accent-gold">
          ▸ Etapa atual: {stageLabel}
        </div>
        <span className="text-[11px] text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2.5 py-0.5">
          {doneCount} de {tasks.length} tarefas
        </span>
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-3 mb-3">
        {tasks.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Sem tarefas nesta etapa.</p>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 py-1 group">
            <button
              type="button"
              onClick={() => onToggle(task)}
              aria-label={task.done ? 'Desmarcar tarefa' : 'Marcar tarefa como feita'}
              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                task.done
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {task.done && <Check className="w-3 h-3" />}
            </button>
            <span className={`text-sm flex-1 ${task.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
              {task.label}
            </span>
            {task.done && task.done_by_name && (
              <span className="text-[10px] text-gray-400">{task.done_by_name}</span>
            )}
            <button
              type="button"
              onClick={() => onRemove(task)}
              aria-label="Remover tarefa"
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {/* Adicionar tarefa avulsa */}
        <form
          onSubmit={(e) => { e.preventDefault(); onAdd(newTask); setNewTask(''); }}
          className="flex items-center gap-2 pt-2 mt-1 border-t border-dashed border-gray-100 dark:border-gray-700"
        >
          <Plus className="w-3.5 h-3.5 text-gray-400" />
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="adicionar tarefa…"
            className="flex-1 bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
          />
        </form>
      </div>

      {/* Ferramentas */}
      <div className="flex flex-wrap gap-2 mb-1">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 inline-flex items-center gap-1.5 hover:border-accent-gold"
        >
          <Paperclip className="w-3.5 h-3.5" /> Anexar documento
        </button>
        <button
          type="button"
          onClick={() => { setNotesDraft(notes); setOpenTool(openTool === 'notes' ? null : 'notes'); }}
          className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 inline-flex items-center gap-1.5 hover:border-accent-gold"
        >
          <PenLine className="w-3.5 h-3.5" /> Editar notas
        </button>
        <button
          type="button"
          onClick={() => { setAId(autentiqueId); setALink(autentiqueLink); setOpenTool(openTool === 'autentique' ? null : 'autentique'); }}
          className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 inline-flex items-center gap-1.5 hover:border-accent-gold"
        >
          <Link2 className="w-3.5 h-3.5" /> Link Autentique
        </button>
      </div>

      {/* Estado atual do documento/link */}
      {(attachmentUrl || autentiqueLink) && (
        <div className="flex flex-wrap gap-3 mt-2">
          {attachmentUrl && (
            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 hover:underline">
              <Download className="w-3 h-3" /> Documento anexado
            </a>
          )}
          {autentiqueLink && (
            <a href={autentiqueLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 hover:underline">
              <ExternalLink className="w-3 h-3" /> Documento no Autentique
            </a>
          )}
        </div>
      )}

      {/* Editor de notas inline */}
      {openTool === 'notes' && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={3}
            className="w-full input-field text-sm"
            placeholder="Anotações do jurídico"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setOpenTool(null)} className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded-lg">Cancelar</button>
            <button type="button" onClick={() => { onSaveNotes(notesDraft); setOpenTool(null); }} className="text-xs px-3 py-1 bg-accent-gold text-white rounded-lg">Salvar</button>
          </div>
        </div>
      )}

      {/* Editor do Autentique inline */}
      {openTool === 'autentique' && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
          <input value={aId} onChange={(e) => setAId(e.target.value)} placeholder="ID do documento no Autentique" className="w-full input-field text-sm" />
          <input value={aLink} onChange={(e) => setALink(e.target.value)} type="url" placeholder="https://app.autentique.com.br/…" className="w-full input-field text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenTool(null)} className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded-lg">Cancelar</button>
            <button type="button" onClick={() => { onSaveAutentique(aId, aLink); setOpenTool(null); }} className="text-xs px-3 py-1 bg-accent-gold text-white rounded-lg">Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(dashboard)/juridico/StageWorkspace.tsx"
git commit -m "feat(juridico-ui): componente StageWorkspace (etapa atual: checklist + ferramentas)"
```

---

## Task 10: Frontend — integrar o workspace no modal + painéis recolhíveis

**Files:**
- Modify: `frontend/app/(dashboard)/juridico/page.tsx`

- [ ] **Step 1: Import the component + helper**

No topo de `page.tsx`, adicionar:

```tsx
import StageWorkspace from './StageWorkspace';
```

Adicionar um helper (perto dos outros, fora do componente) para o rótulo da etapa a partir do status:

```tsx
const stageLabelFor = (status: string): string =>
  (MODALITIES.flatMap((m) => m.columns).find((c) => c.key === status)?.label) ?? status;
```

- [ ] **Step 2: Render `StageWorkspace` no topo do corpo do modal**

No bloco `{detailCase && ( ... )}`, **dentro** de `<div className="p-6 space-y-6">` e **antes** da `<section>` "Painel 1: Dados do Cliente", inserir:

```tsx
                {/* Zona 1 — Etapa atual (workspace) */}
                <StageWorkspace
                  stageLabel={stageLabelFor(detailCase.status)}
                  tasks={detailCase.tasks.filter((t) => t.stage === detailCase.status)}
                  attachmentUrl={detailCase.attachment}
                  notes={detailCase.notes}
                  autentiqueId={detailCase.autentique_id}
                  autentiqueLink={detailCase.autentique_link}
                  onToggle={toggleTask}
                  onAdd={(label) => addTask(detailCase.id, label)}
                  onRemove={removeTask}
                  onUpload={(file) => uploadAttachment(detailCase.id, file)}
                  onSaveNotes={(n) => saveNotes(detailCase.id, n)}
                  onSaveAutentique={(id, link) => saveAutentique(detailCase.id, id, link)}
                />
```

> `detailCase.attachment` vem do serializer (`LegalCaseSerializer.Meta.fields` já inclui `attachment`); o DRF serializa o `FileField` como URL (ou `null`). O campo `attachment` foi adicionado à interface `LegalCase` no Task 8.

- [ ] **Step 3: Tornar os 3 painéis de contexto recolhíveis**

Envolver cada uma das `<section>` existentes (Dados do Cliente, Proposta Fechada, Histórico) num `<details>` para virarem colapsáveis. Exemplo para "Dados do Cliente" — trocar a abertura `<section>` e seu `<h3>` por:

```tsx
                <details className="group" open>
                  <summary className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 cursor-pointer list-none">
                    <Building2 className="w-4 h-4 text-accent-gold" />
                    Dados do Cliente
                  </summary>
```

E fechar com `</details>` no lugar do `</section>` correspondente. Repetir o mesmo padrão para "Proposta Fechada" (ícone `FileText`) e "Histórico" (ícone `History`), mantendo o conteúdo interno intacto. Deixar "Histórico" sem `open` (recolhido por padrão) e os outros dois `open`.

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Manual check (visual)**

Run: `cd frontend && npm run dev` (com o backend rodando). Abrir `/juridico`, clicar num card e confirmar: a Zona 1 aparece no topo com checklist + 3 ferramentas; marcar/adicionar/remover tarefa funciona; anexar documento, editar notas e link Autentique persistem; os painéis Dados/Proposta/Histórico recolhem/expandem.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(dashboard)/juridico/page.tsx"
git commit -m "feat(juridico-ui): modal vira workspace (StageWorkspace) + painéis recolhíveis"
```

---

## Task 11: Frontend — badge de progresso no card + aviso ao Avançar

**Files:**
- Modify: `frontend/app/(dashboard)/juridico/page.tsx`

- [ ] **Step 1: Import `ConfirmDialog` + state**

No topo de `page.tsx`:

```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
```

Dentro do componente, adicionar estado para o aviso pendente:

```tsx
  const [pendingAdvance, setPendingAdvance] = useState<LegalCase | null>(null);
```

- [ ] **Step 2: Badge de progresso no rosto do card**

No card do kanban (bloco onde já se renderiza a data de criação e os botões), adicionar — logo antes do `<div className="flex items-center gap-1.5">` que contém Recusar/Avançar — o badge derivado das tarefas da etapa atual:

```tsx
                          {(() => {
                            const stageTasks = legalCase.tasks?.filter((t) => t.stage === legalCase.status) ?? [];
                            if (stageTasks.length === 0) return null;
                            const done = stageTasks.filter((t) => t.done).length;
                            return (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {done}/{stageTasks.length}
                              </span>
                            );
                          })()}
```

(`CheckCircle2` já está importado no arquivo.)

- [ ] **Step 3: Interceptar o Avançar com o aviso**

Trocar o corpo de `handleAdvanceClick` para checar tarefas pendentes da etapa atual antes de seguir. Substituir a função existente por:

```tsx
  const proceedAdvance = (legalCase: LegalCase) => {
    const target = nextStatus(legalCase);
    if (!target) return;
    const goesToSignFlow =
      (legalCase.process_type !== 'aditivo' && legalCase.status === 'preparacao' && target === 'envio_assinatura')
      || (legalCase.process_type === 'aditivo' && legalCase.status === 'preparacao' && target === 'aguardando_assinatura');
    if (goesToSignFlow) {
      setAutentiqueId(legalCase.autentique_id || '');
      setAutentiqueLink(legalCase.autentique_link || '');
      setTransitionTarget(legalCase);
    } else {
      doTransition(legalCase, target);
    }
  };

  const handleAdvanceClick = (legalCase: LegalCase) => {
    const stageTasks = legalCase.tasks?.filter((t) => t.stage === legalCase.status) ?? [];
    const hasPending = stageTasks.some((t) => !t.done);
    if (hasPending) {
      setPendingAdvance(legalCase);   // abre o ConfirmDialog
      return;
    }
    proceedAdvance(legalCase);
  };
```

- [ ] **Step 4: Render the `ConfirmDialog`**

No fim do JSX retornado (junto dos outros modais, antes do `</div>` final do componente), adicionar:

```tsx
      <ConfirmDialog
        open={pendingAdvance !== null}
        danger={false}
        title="Tarefas pendentes"
        description="Há tarefas pendentes nesta etapa. Avançar mesmo assim?"
        confirmLabel="Avançar"
        onCancel={() => setPendingAdvance(null)}
        onConfirm={() => {
          const c = pendingAdvance;
          setPendingAdvance(null);
          if (c) proceedAdvance(c);
        }}
      />
```

- [ ] **Step 5: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Manual check**

Abrir `/juridico`: o card mostra `done/total`; clicar "Avançar" com tarefa pendente abre o aviso "Tarefas pendentes"; confirmar avança; sem pendência avança direto.

- [ ] **Step 7: Final frontend gate + commit**

Run: `cd frontend && npx tsc --noEmit && npx next lint`
Expected: sem erros.

```bash
git add "frontend/app/(dashboard)/juridico/page.tsx"
git commit -m "feat(juridico-ui): badge de progresso no card + aviso de tarefas pendentes ao avançar"
```

---

## Verificação final (antes de abrir o PR)

- [ ] Backend: `cd backend && pytest -q` — tudo verde; cobertura `juridico/` ≥ 70%.
- [ ] Backend: confirmar que a migration nova é só aditiva (`git show` na migration: `CreateModel`/`AddField`/`AlterField` de choice — nenhuma remoção/alteração destrutiva).
- [ ] Frontend: `cd frontend && npx tsc --noEmit && npx next lint && npm run build`.
- [ ] Backfill documentado: no deploy, rodar `python manage.py seed_legal_case_tasks` 1× (idempotente) para os cards já em produção.
- [ ] Abrir PR de `feat/juridico-card-workspace` para revisão (não mergear sem o gate de deploy — ERP em produção).

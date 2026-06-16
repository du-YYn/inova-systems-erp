"""F1: integration tests for engine.gerar_game_plan() (pure function).

Validates phase dating, entrega/entrega_base, holidays in range, warnings
(capped / re-update / extension) and both counting modes.
"""
from datetime import date

from projects.scheduling import CronogramaParams, GamePlan, gerar_game_plan

ONB = date(2026, 6, 10)


def make_params(**kwargs):
    defaults = dict(data_onboarding=ONB)
    defaults.update(kwargs)
    return CronogramaParams(**defaults)


class TestGamePlanDefault:
    def test_returns_game_plan(self):
        plan = gerar_game_plan(make_params())
        assert isinstance(plan, GamePlan)

    def test_phase_order_and_days(self):
        plan = gerar_game_plan(make_params())
        assert [f.key for f in plan.fases] == ['doc', 'val', 'dev', 'aud', 'hom', 'ent']
        assert [f.dias for f in plan.fases] == [7, 2, 23, 4, 7, 2]

    def test_cumulative_offsets(self):
        plan = gerar_game_plan(make_params())
        assert [f.cum_prev for f in plan.fases] == [0, 7, 9, 32, 36, 43]
        assert [f.cum_end for f in plan.fases] == [7, 9, 32, 36, 43, 45]

    def test_phase_dates(self):
        plan = gerar_game_plan(make_params())
        doc = plan.fases[0]
        # Documentação starts 1 business day after Dia 0
        assert doc.inicio == date(2026, 6, 11)
        assert doc.fim == date(2026, 6, 19)
        ent = plan.fases[5]
        assert ent.inicio == date(2026, 8, 12)
        assert ent.fim == date(2026, 8, 13)

    def test_entrega(self):
        plan = gerar_game_plan(make_params())
        assert plan.entrega_base == date(2026, 8, 13)  # onb + 45 business days
        assert plan.entrega == date(2026, 8, 13)
        assert plan.total_gap == 0

    def test_pct_default(self):
        plan = gerar_game_plan(make_params())
        by_key = {f.key: f.pct for f in plan.fases}
        assert by_key['doc'] == 15
        assert by_key['dev'] == 50
        assert by_key['aud'] == 8
        # auto phases: round(days/total*100)
        assert by_key['val'] == 4    # round(2/45*100) = round(4.44)
        assert by_key['hom'] == 16   # round(7/45*100) = round(15.56)
        assert by_key['ent'] == 4

    def test_holidays_in_period(self):
        # Between 2026-06-10 and 2026-08-13 the only weekday holiday is Jul 9 (SP)
        plan = gerar_game_plan(make_params())
        assert [(h.data, h.nome) for h in plan.feriados] == [
            (date(2026, 7, 9), 'Revolução Constitucionalista (SP)'),
        ]

    def test_substeps_attached_to_phases(self):
        plan = gerar_game_plan(make_params())
        for fase in plan.fases:
            assert len(fase.sub_passos) > 0

    def test_no_warnings_by_default(self):
        plan = gerar_game_plan(make_params())
        assert plan.capped is False
        assert plan.avisos == []


class TestGamePlanCorridos:
    def test_entrega_calendar_days(self):
        plan = gerar_game_plan(make_params(modo='corridos'))
        assert plan.entrega == date(2026, 7, 25)  # onb + 45 calendar days

    def test_no_holidays_listed(self):
        plan = gerar_game_plan(make_params(modo='corridos'))
        assert plan.feriados == []

    def test_doc_starts_next_calendar_day(self):
        plan = gerar_game_plan(make_params(modo='corridos'))
        assert plan.fases[0].inicio == date(2026, 6, 11)


class TestGamePlanCapped:
    def test_capped_flag_and_warning(self):
        plan = gerar_game_plan(make_params(pct_doc=30, pct_dev=70, pct_aud=25))
        assert plan.capped is True
        assert any('reduzid' in aviso for aviso in plan.avisos)


class TestGamePlanReupd:
    def test_reupd_fits_no_warning(self):
        plan = gerar_game_plan(make_params(reupd_fds=2))
        assert plan.reupd_info is not None
        assert plan.reupd_info.used == 2
        assert plan.avisos == []
        # entrega unchanged by crunch
        assert plan.entrega == date(2026, 8, 13)

    def test_reupd_exceeds_warning(self):
        plan = gerar_game_plan(make_params(reupd_fds=8))
        assert plan.reupd_info.used == 2
        assert plan.reupd_info.requested == 8
        assert any('fim de semana' in aviso for aviso in plan.avisos)


class TestGamePlanMeetings:
    def test_meetings_natural_dates(self):
        plan = gerar_game_plan(make_params())
        assert plan.reunioes['val'].data_natural == date(2026, 6, 22)
        assert plan.reunioes['apr'].data_natural == date(2026, 8, 3)
        assert plan.reunioes['grad'].data_natural == date(2026, 8, 12)
        assert all(r.gap == 0 for r in plan.reunioes.values())

    def test_reschedule_extends_entrega(self):
        plan = gerar_game_plan(
            make_params(data_reuniao_validacao=date(2026, 6, 24))
        )
        assert plan.reunioes['val'].gap == 2
        assert plan.total_gap == 2
        assert plan.entrega_base == date(2026, 8, 13)
        assert plan.entrega == date(2026, 8, 17)  # +2 business days (skip weekend)
        assert any('estend' in aviso for aviso in plan.avisos)

    def test_reschedule_shifts_later_phases_only(self):
        base = gerar_game_plan(make_params())
        plan = gerar_game_plan(
            make_params(data_reuniao_validacao=date(2026, 6, 24))
        )
        # doc (before offV) unchanged
        assert plan.fases[0].inicio == base.fases[0].inicio
        assert plan.fases[0].fim == base.fases[0].fim
        # val starts at the rescheduled date
        assert plan.fases[1].inicio == date(2026, 6, 24)
        # ent shifted by 2 business days
        assert plan.fases[5].fim == date(2026, 8, 17)

    def test_reschedule_before_natural_ignored(self):
        plan = gerar_game_plan(
            make_params(data_reuniao_validacao=date(2026, 6, 15))
        )
        assert plan.total_gap == 0
        assert plan.entrega == date(2026, 8, 13)
        assert plan.avisos == []


class TestPurity:
    def test_same_input_same_output(self):
        p1 = gerar_game_plan(make_params(reupd_fds=3,
                                         data_reuniao_validacao=date(2026, 6, 24)))
        p2 = gerar_game_plan(make_params(reupd_fds=3,
                                         data_reuniao_validacao=date(2026, 6, 24)))
        assert p1 == p2

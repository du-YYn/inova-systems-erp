"""F1: tests for scheduling/substeps.py — SUBS expansion.

Blocks split by weight (last absorbs remainder), milestones start/end/here,
weekly recurrence on Fridays skipping holidays (uteis mode), and the
weekend crunch on the re-update block (cap + warning data, uteis only).

Default scenario (45 dias úteis, onboarding 2026-06-10):
phases doc=7 val=2 dev=23 aud=4 hom=7 ent=2; cum_prev doc=0 val=7 dev=9
aud=32 hom=36 ent=43.
"""
from datetime import date
from functools import partial

from projects.scheduling.calendar import add_business_days, holiday_map
from projects.scheduling.substeps import SUBS, expand_substeps

ONB = date(2026, 6, 10)
HMAP = holiday_map(2026, 3)
ADD_X = partial(add_business_days, holidays=HMAP)
NO_DELAY = lambda offset: 0  # noqa: E731


def expand(phase_key, cum_prev, days, *, reupd_fds=0, modo='uteis',
           delay_antes=NO_DELAY):
    return expand_substeps(
        phase_key, cum_prev, days,
        data_onboarding=ONB,
        modo=modo,
        holidays=HMAP if modo == 'uteis' else None,
        reupd_fds=reupd_fds,
        add_x=ADD_X,
        delay_antes=delay_antes,
    )


class TestSubsDefinition:
    def test_subs_has_all_phases(self):
        assert set(SUBS.keys()) == {'doc', 'val', 'dev', 'aud', 'hom', 'ent'}

    def test_doc_labels_match_v34(self):
        labels = [s['l'] for s in SUBS['doc']]
        assert labels == [
            'Produção da documentação',
            'Design e wireframes',
            'Revisão interna e apresentação',
            'Documentação pronta pra validar',
            'Agendar a reunião de validação com o cliente',
        ]

    def test_hom_has_crunch_block(self):
        crunch = [s for s in SUBS['hom'] if s.get('crunch')]
        assert len(crunch) == 1
        assert crunch[0]['l'] == 're-update'
        assert crunch[0]['w'] == 45


class TestBlocks:
    def test_doc_blocks_split_by_weight_last_absorbs(self):
        # D=7, weights 60/25/15 → 4 + 2 + 1 (last absorbs remainder)
        steps, _ = expand('doc', 0, 7)
        bloco1 = [s for s in steps if s.label == 'Produção da documentação']
        bloco2 = [s for s in steps if s.label == 'Design e wireframes']
        bloco3 = [s for s in steps if s.label == 'Revisão interna e apresentação']
        assert len(bloco1) == 4
        assert len(bloco2) == 2
        assert len(bloco3) == 1
        # dates: business days 1..7 from onboarding
        assert [s.data for s in bloco1] == [
            date(2026, 6, 11), date(2026, 6, 12),
            date(2026, 6, 15), date(2026, 6, 16),
        ]
        assert [s.data for s in bloco2] == [date(2026, 6, 17), date(2026, 6, 18)]
        assert [s.data for s in bloco3] == [date(2026, 6, 19)]

    def test_block_positions(self):
        steps, _ = expand('doc', 0, 7)
        bloco1 = [s for s in steps if s.label == 'Produção da documentação']
        assert [s.pos for s in bloco1] == ['ini', 'mid', 'mid', 'fim']
        assert all(s.single is False for s in bloco1)
        bloco3 = [s for s in steps if s.label == 'Revisão interna e apresentação']
        assert bloco3[0].pos == 'ini'
        assert bloco3[0].single is True

    def test_doc_end_milestones(self):
        steps, _ = expand('doc', 0, 7)
        marcos = [s for s in steps if s.kind == 'marco']
        assert len(marcos) == 2
        assert all(m.data == date(2026, 6, 19) for m in marcos)  # at(D=7)


class TestMilestones:
    def test_val_start_block_end(self):
        # val: cum_prev=7, D=2
        steps, _ = expand('val', 7, 2)
        start = steps[0]
        assert start.kind == 'marco'
        assert start.data == date(2026, 6, 22)  # at(8)
        bloco = [s for s in steps if s.kind == 'bloco']
        assert [s.data for s in bloco] == [date(2026, 6, 22), date(2026, 6, 23)]
        end = steps[-1]
        assert end.kind == 'marco'
        assert end.label == 'Cliente assina, baseline oficial'
        assert end.data == date(2026, 6, 23)  # at(9)

    def test_ent_here_milestone_half_phase(self):
        # ent: cum_prev=43, D=2 → here idx = max(1, round(2/2)) = 1
        steps, _ = expand('ent', 43, 2)
        assert [s.kind for s in steps] == ['marco', 'marco', 'marco']
        assert steps[0].data == date(2026, 8, 12)  # start at(44)
        assert steps[1].data == date(2026, 8, 12)  # here at(44)
        assert steps[2].data == date(2026, 8, 13)  # end at(45)


class TestRecurrence:
    def test_dev_weekly_fridays(self):
        # dev: cum_prev=9, D=23 → range at(10)=2026-06-24 .. at(32)=2026-07-27
        steps, _ = expand('dev', 9, 23)
        recs = [s for s in steps if s.kind == 'rec']
        assert [s.data for s in recs] == [
            date(2026, 6, 26), date(2026, 7, 3), date(2026, 7, 10),
            date(2026, 7, 17), date(2026, 7, 24),
        ]
        assert all(s.data.weekday() == 4 for s in recs)  # Friday

    def test_recurrence_skips_holiday_friday_in_uteis(self):
        # onboarding 2026-03-02: dev range covers Sexta-feira Santa (2026-04-03)
        onb = date(2026, 3, 2)
        add_x = partial(add_business_days, holidays=HMAP)
        steps, _ = expand_substeps(
            'dev', 9, 23,
            data_onboarding=onb, modo='uteis', holidays=HMAP,
            reupd_fds=0, add_x=add_x, delay_antes=NO_DELAY,
        )
        recs = [s.data for s in steps if s.kind == 'rec']
        assert date(2026, 4, 3) not in recs  # Sexta-feira Santa skipped
        assert date(2026, 3, 20) in recs
        assert date(2026, 3, 27) in recs
        assert date(2026, 4, 10) in recs


class TestCrunch:
    """hom: cum_prev=36, D=7 → blocks 4 (janela) + 3 (re-update).

    re-update rows: at(41)=2026-08-07 (Fri), at(42)=2026-08-10, at(43)=2026-08-11.
    Weekends strictly between Aug 7 and Aug 11: Aug 8 (Sat), Aug 9 (Sun) → 2.
    """

    def test_no_crunch_without_reupd(self):
        steps, info = expand('hom', 36, 7, reupd_fds=0)
        reupd = [s for s in steps if s.label == 're-update']
        assert len(reupd) == 3
        assert not any(s.ws for s in reupd)
        assert info is not None
        assert info.base == 3
        assert info.requested == 0
        assert info.used == 0

    def test_crunch_adds_weekend_days(self):
        steps, info = expand('hom', 36, 7, reupd_fds=2)
        reupd = [s for s in steps if s.label == 're-update']
        assert [s.data for s in reupd] == [
            date(2026, 8, 7), date(2026, 8, 8), date(2026, 8, 9),
            date(2026, 8, 10), date(2026, 8, 11),
        ]
        assert [s.ws for s in reupd] == [False, True, True, False, False]
        assert [s.pos for s in reupd] == ['ini', 'mid', 'mid', 'mid', 'fim']
        assert info.base == 3
        assert info.requested == 2
        assert info.available == 2
        assert info.used == 2
        assert info.total == 5

    def test_crunch_caps_at_available_weekends(self):
        steps, info = expand('hom', 36, 7, reupd_fds=8)
        reupd = [s for s in steps if s.label == 're-update']
        assert len(reupd) == 5  # 3 base + only 2 weekend days fit
        assert info.requested == 8
        assert info.available == 2
        assert info.used == 2

    def test_crunch_only_in_uteis_mode(self):
        steps, info = expand('hom', 36, 7, reupd_fds=2, modo='corridos')
        reupd = [s for s in steps if s.label == 're-update']
        assert not any(s.ws for s in reupd)
        assert info.used == 0
        assert info.available == 0

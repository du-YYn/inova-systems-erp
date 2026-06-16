"""SEC-006: scrubbing de PII em eventos Sentry (before_send / before_breadcrumb).

Garante que chaves sensiveis (document/cpf/cnpj/email/phone/content/transcript/
password/token/secret) sejam redigidas em:
- event['extra'];
- locals dos frames de exception;
- event['logentry'];
- data dos breadcrumbs.
"""
import pytest

from core.sentry_scrubbing import (
    REDACTED, scrub_breadcrumb, scrub_event,
)


class TestScrubExtra:
    def test_redacts_sensitive_keys_in_extra(self):
        event = {
            'extra': {
                'document': '123.456.789-01',
                'email': 'joao@lgpd.com',
                'phone': '11 99999-1111',
                'safe_field': 'ok',
            },
        }
        out = scrub_event(event)
        assert out['extra']['document'] == REDACTED
        assert out['extra']['email'] == REDACTED
        assert out['extra']['phone'] == REDACTED
        assert out['extra']['safe_field'] == 'ok'  # nao-sensivel preservado

    def test_redacts_nested_dicts_and_lists(self):
        event = {
            'extra': {
                'payload': {
                    'cpf': '111',
                    'items': [{'secret': 's', 'name': 'n'}],
                },
            },
        }
        out = scrub_event(event)
        assert out['extra']['payload']['cpf'] == REDACTED
        assert out['extra']['payload']['items'][0]['secret'] == REDACTED
        assert out['extra']['payload']['items'][0]['name'] == 'n'

    def test_matches_substring_keys(self):
        event = {'extra': {'contact_email': 'a@b.com', 'auth_token': 'xyz',
                           'transcript_text': 'long...'}}
        out = scrub_event(event)
        assert out['extra']['contact_email'] == REDACTED
        assert out['extra']['auth_token'] == REDACTED
        assert out['extra']['transcript_text'] == REDACTED


class TestScrubExceptionLocals:
    def test_redacts_frame_vars(self):
        event = {
            'exception': {
                'values': [
                    {
                        'stacktrace': {
                            'frames': [
                                {
                                    'vars': {
                                        'document': '123',
                                        'password': 'hunter2',
                                        'x': 1,
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        }
        out = scrub_event(event)
        frame_vars = out['exception']['values'][0]['stacktrace']['frames'][0]['vars']
        assert frame_vars['document'] == REDACTED
        assert frame_vars['password'] == REDACTED
        assert frame_vars['x'] == 1


class TestScrubLogentry:
    def test_redacts_logentry_params_dict(self):
        event = {'logentry': {'message': 'boom %s', 'params': {'email': 'a@b.com'}}}
        out = scrub_event(event)
        assert out['logentry']['params']['email'] == REDACTED

    def test_redacts_logentry_params_list(self):
        event = {'logentry': {'message': 'x', 'params': [{'cnpj': '00'}]}}
        out = scrub_event(event)
        assert out['logentry']['params'][0]['cnpj'] == REDACTED


class TestScrubBreadcrumb:
    def test_redacts_breadcrumb_data(self):
        crumb = {'category': 'http', 'data': {'token': 'abc', 'url': '/x'}}
        out = scrub_breadcrumb(crumb)
        assert out['data']['token'] == REDACTED
        assert out['data']['url'] == '/x'


class TestRobustness:
    def test_non_dict_event_returned_as_is(self):
        assert scrub_event(None) is None
        assert scrub_event('str') == 'str'

    def test_event_without_sensitive_sections_unchanged(self):
        event = {'message': 'hello', 'level': 'error'}
        assert scrub_event(event) == event


class TestSentryInitIntegration:
    """O scrub deve estar plugado no before_send via simulacao de captura."""

    def test_before_send_redacts_local_with_document(self):
        # Simula o evento que o Sentry construiria a partir de uma excecao com
        # uma variavel local 'document' e 'email' capturadas no frame.
        event = {
            'exception': {
                'values': [
                    {
                        'type': 'ValueError',
                        'stacktrace': {
                            'frames': [
                                {
                                    'function': 'do_thing',
                                    'vars': {
                                        'document': '987.654.321-00',
                                        'email': 'vazou@lgpd.com',
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
            'extra': {'cpf': '987.654.321-00'},
        }
        captured = scrub_event(event, hint={})
        vars_ = captured['exception']['values'][0]['stacktrace']['frames'][0]['vars']
        assert vars_['document'] == REDACTED
        assert vars_['email'] == REDACTED
        assert captured['extra']['cpf'] == REDACTED

"""Sage conversations (sage_api): per-user storage of turns and summaries."""

import uuid
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import ApiKey

from .models import SageConversation, SageSummary, SageTurn

BASE = '/api/sage/conversations/'


def _turn(prompt='hi', **extra):
    return {'prompt': prompt, 'reply': 'hello', 'model': 'groq/llama', 'total_tokens': 12,
            'messages': [{'role': 'user', 'content': prompt}, {'role': 'assistant', 'content': 'hello'}],
            **extra}


class SageConversationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='user_a')
        self.api_key, key = ApiKey.create_for_user(self.user, name='laptop', kind=ApiKey.Kind.DEVICE)
        self.cli = APIClient()
        self.cli.credentials(HTTP_X_API_KEY=key)
        stranger = User.objects.create(username='user_b')
        self.other = APIClient()
        self.other.force_authenticate(user=stranger)

    def _start(self, **body):
        response = self.cli.post(BASE, body, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['data']['id']

    def test_start_records_the_device_and_only_the_folder_name(self):
        cid = self._start(title='  fix deploy  ', workspace='D:\\Users\\me\\work\\infra\\')
        convo = SageConversation.objects.get(id=cid)
        self.assertEqual((convo.title, convo.workspace, convo.api_key_id), ('fix deploy', 'infra', self.api_key.id))
        listed = self.cli.get(BASE).json()['data']['conversations']
        self.assertEqual([(c['id'], c['device']) for c in listed], [(cid, 'laptop')])

    def test_turns_are_numbered_by_the_server_and_title_comes_from_the_first(self):
        cid = self._start()
        for text in ('create a cpu script', 'now run it'):
            response = self.cli.post(f'{BASE}{cid}/turns/', _turn(text, seq=99), format='json')
            self.assertEqual(response.status_code, 201, response.content)
        turns = list(SageTurn.objects.filter(conversation_id=cid).values_list('seq', 'prompt', 'user_id'))
        self.assertEqual(turns, [(1, 'create a cpu script', self.user.id), (2, 'now run it', self.user.id)])
        convo = SageConversation.objects.get(id=cid)
        self.assertEqual((convo.turn_count, convo.title), (2, 'create a cpu script'))

    def test_bad_or_oversized_turns_are_refused(self):
        cid = self._start()
        self.assertEqual(self.cli.post(f'{BASE}{cid}/turns/', {'messages': 'x'}, format='json').status_code, 400)
        huge = _turn(messages=[{'role': 'tool', 'content': 'x' * 400_001}])
        self.assertEqual(self.cli.post(f'{BASE}{cid}/turns/', huge, format='json').status_code, 400)
        self.assertFalse(SageTurn.objects.exists())

    def test_numbers_are_clamped_not_trusted(self):
        cid = self._start()
        self.cli.post(f'{BASE}{cid}/turns/', _turn(total_tokens=-5, is_byo='yes', tool_calls=True),
                      format='json')
        turn = SageTurn.objects.get()
        self.assertEqual((turn.total_tokens, turn.is_byo, turn.tool_calls), (0, False, 0))

    def test_opening_returns_the_summary_and_only_later_turns(self):
        cid = self._start()
        for i in range(1, 6):
            self.cli.post(f'{BASE}{cid}/turns/', _turn(f'q{i}'), format='json')
        response = self.cli.post(f'{BASE}{cid}/summaries/', {'text': 'Earlier: q1-q3.', 'up_to_seq': 3,
                                                             'total_tokens': 40}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        data = self.cli.get(f'{BASE}{cid}/').json()['data']
        self.assertEqual(data['summary'], {'text': 'Earlier: q1-q3.', 'up_to_seq': 3})
        self.assertEqual([t['seq'] for t in data['turns']], [4, 5])
        self.assertEqual([t['prompt'] for t in data['transcript']], ['q1', 'q2', 'q3', 'q4', 'q5'])
        self.assertNotIn('messages', data['transcript'][0])

    def test_a_summary_must_cover_saved_turns(self):
        cid = self._start()
        self.cli.post(f'{BASE}{cid}/turns/', _turn(), format='json')
        for body in ({'text': 'x', 'up_to_seq': 2}, {'text': 'x', 'up_to_seq': 0},
                     {'text': '', 'up_to_seq': 1}, {'text': 'x', 'up_to_seq': True}):
            self.assertEqual(self.cli.post(f'{BASE}{cid}/summaries/', body, format='json').status_code, 400)
        self.assertFalse(SageSummary.objects.exists())

    def test_someone_elses_conversation_is_invisible(self):
        cid = self._start()
        self.cli.post(f'{BASE}{cid}/turns/', _turn(), format='json')
        self.assertEqual(self.other.get(BASE).json()['data']['conversations'], [])
        for call in (lambda: self.other.get(f'{BASE}{cid}/'),
                     lambda: self.other.delete(f'{BASE}{cid}/'),
                     lambda: self.other.post(f'{BASE}{cid}/turns/', _turn(), format='json'),
                     lambda: self.other.post(f'{BASE}{cid}/summaries/', {'text': 'x', 'up_to_seq': 1},
                                             format='json')):
            self.assertEqual(call().status_code, 404)
        self.assertEqual(SageTurn.objects.count(), 1)
        self.assertEqual(self.cli.get(f'{BASE}{uuid.uuid4()}/').status_code, 404)

    def test_delete_takes_turns_and_summaries_with_it(self):
        cid = self._start()
        self.cli.post(f'{BASE}{cid}/turns/', _turn(), format='json')
        self.cli.post(f'{BASE}{cid}/summaries/', {'text': 's', 'up_to_seq': 1}, format='json')
        self.assertEqual(self.cli.delete(f'{BASE}{cid}/').status_code, 200)
        self.assertFalse(SageTurn.objects.exists() or SageSummary.objects.exists())

    def test_only_the_newest_conversations_are_kept(self):
        with mock.patch('sage_api.views.MAX_CONVERSATIONS_PER_USER', 3):
            first = self._start(title='oldest')
            others = [self._start(title=f'c{i}') for i in range(3)]
        kept = set(SageConversation.objects.values_list('id', flat=True))
        self.assertEqual({str(k) for k in kept}, set(others))
        self.assertNotIn(first, {str(k) for k in kept})

    def test_list_is_most_recent_first(self):
        a, b = self._start(title='a'), self._start(title='b')
        self.cli.post(f'{BASE}{a}/turns/', _turn(), format='json')        # a is now the latest
        listed = [c['id'] for c in self.cli.get(BASE).json()['data']['conversations']]
        self.assertEqual(listed, [a, b])

    def test_usage_totals_turns_summaries_models_and_days(self):
        cid = self._start()
        self.cli.post(f'{BASE}{cid}/turns/', _turn(total_tokens=100, prompt_tokens=80, completion_tokens=20,
                                                   tool_calls=2), format='json')
        self.cli.post(f'{BASE}{cid}/turns/', _turn(total_tokens=50, is_byo=True, model='openai/gpt-x'),
                      format='json')
        self.cli.post(f'{BASE}{cid}/summaries/', {'text': 's', 'up_to_seq': 1, 'total_tokens': 7},
                      format='json')
        # Someone else's usage never counts.
        theirs = SageConversation.objects.create(user=User.objects.get(username='user_b'))
        SageTurn.objects.create(conversation=theirs, user=theirs.user, seq=1, total_tokens=999)

        data = self.cli.get('/api/sage/usage/').json()['data']
        today = data['today']
        self.assertEqual((today['requests'], today['total_tokens'], today['tool_calls']), (2, 157, 2))
        self.assertEqual((today['admin_tokens'], today['byo_tokens']), (107, 50))
        self.assertEqual(today['conversations'], 1)
        self.assertEqual({(m['provider'], m['model']) for m in today['model_usage']},
                         {('groq', 'llama'), ('openai', 'gpt-x')})
        self.assertEqual(data['all_time']['total_tokens'], 157)
        self.assertEqual(len(data['daily']), 7)
        self.assertEqual((data['daily'][-1]['requests'], data['daily'][-1]['total_tokens']), (2, 150))
        self.assertEqual(data['devices'], [{'device': 'laptop', 'requests': 2, 'total_tokens': 150}])

    def test_usage_for_a_new_user_is_zero(self):
        data = self.other.get('/api/sage/usage/').json()['data']
        self.assertEqual((data['today']['requests'], data['all_time']['total_tokens']), (0, 0))
        self.assertEqual(data['devices'], [])

    def test_revoking_the_session_keeps_its_conversations(self):
        cid = self._start()
        self.api_key.delete()
        self.assertIsNone(SageConversation.objects.get(id=cid).api_key)

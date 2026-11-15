import { expect, mock, test } from 'bun:test';
import { testEnv } from './test-env.js';

// thread.ts reaches Kit's env through forgejo.ts; only its pure helpers are tested here.
mock.module('$app/env/private', testEnv);
const { groupReactions, shapeEvent } = await import('./thread.js');

const user = { id: 1, login: 'ada', full_name: '', avatar_url: '' };
const ev = (type: string, extra: Record<string, unknown> = {}) => ({ id: 1, type, user, body: '', created_at: '2026-01-01T00:00:00Z', ...extra });

test('reactions group by emoji and know which are mine', () => {
	const u = (login: string) => ({ ...user, login });
	expect(groupReactions([{ content: 'heart', user: u('a') }, { content: 'heart', user: u('ada') }, { content: '+1', user: u('a') }], 'ada')).toEqual([
		{ content: 'heart', users: ['a', 'ada'], mine: true },
		{ content: '+1', users: ['a'], mine: false }
	]);
	expect(groupReactions(null)).toEqual([]);
});

test('timeline events take the shape the page draws', () => {
	expect(shapeEvent(ev('pull_ref', { ref_repo: 'ada/x', ref_number: 4, ref_title: 'Fix', ref_is_pull: true }))?.link).toEqual({ href: '/ada/x/pulls/4', text: 'ada/x#4', title: 'Fix' });
	expect(shapeEvent(ev('pull_push', { is_force_push: false, commit_ids: ['a', 'b'] }))?.push).toEqual({ forced: false, commits: ['a', 'b'], before: undefined, after: undefined });
	expect(shapeEvent(ev('review_request', { assignee: { ...user, login: 'r' }, removed_assignee: true }))).toMatchObject({ who: 'r', removed: true });
	expect(shapeEvent(ev('change_target_branch', { old_ref: 'a', new_ref: 'b' }))?.refs).toEqual({ from: 'a', to: 'b' });
	expect(shapeEvent(ev('label', { label: null }))).toBeNull();
	expect(shapeEvent(ev('something_new'))).toBeNull();
});

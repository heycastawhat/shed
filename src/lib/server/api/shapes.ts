import type { Database } from 'bun:sqlite';
import { toUser, type UserRow } from '../accounts.js';
import { userJson } from './common.js';

// Shed rows in Forgejo's JSON shapes.

export type IssueRow = {
	id: number;
	repo_id: number;
	number: number;
	user_id: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	is_pull: number;
	milestone_id: number | null;
	locked: number;
	pinned: number;
	due_on: string | null;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
};
export type PullRow = IssueRow & {
	issue_id: number;
	base: string;
	head: string;
	head_repo_id: number | null;
	head_sha: string;
	merge_base: string | null;
	draft: number;
	merged_at: string | null;
	merged_by: number | null;
	merge_commit: string | null;
	auto_merge: string | null;
	auto_merge_by: number | null;
	auto_merge_message: string | null;
};
export type LabelRow = { id: number; repo_id: number; name: string; color: string; description: string };
export type MilestoneRow = { id: number; repo_id: number; title: string; description: string; state: 'open' | 'closed'; due_on: string | null; closed_at: string | null; created_at: string };
export type CommentRow = {
	id: number;
	issue_id: number;
	user_id: number;
	body: string;
	review_id: number | null;
	path: string | null;
	side: 'old' | 'new' | null;
	line: number | null;
	commit_sha: string | null;
	diff_hunk: string | null;
	resolved_by: number | null;
	resolved_at: string | null;
	created_at: string;
	updated_at: string;
};
export type ReviewRow = { id: number; issue_id: number; user_id: number; state: string; body: string; commit_sha: string; dismissed: number; created_at: string };

export const labelJson = (l: LabelRow) => ({ id: l.id, name: l.name, color: l.color, description: l.description, exclusive: false, is_archived: false, url: '' });

export function milestoneJson(db: Database, m: MilestoneRow) {
	const c = db
		.query<{ open: number; closed: number }, [number]>(
			"select coalesce(sum(state = 'open'), 0) as open, coalesce(sum(state = 'closed'), 0) as closed from issues where milestone_id = ?"
		)
		.get(m.id)!;
	return { id: m.id, title: m.title, description: m.description, state: m.state, open_issues: c.open, closed_issues: c.closed, due_on: m.due_on, closed_at: m.closed_at, created_at: m.created_at };
}

export function issueLabels(db: Database, issueId: number) {
	return db.query<LabelRow, [number]>('select l.* from labels l join issue_labels il on il.label_id = l.id where il.issue_id = ? order by l.name').all(issueId).map(labelJson);
}
export function issueAssignees(db: Database, issueId: number) {
	return db.query<UserRow, [number]>('select u.* from users u join assignees a on a.user_id = u.id where a.issue_id = ? order by u.login').all(issueId).map(toUser);
}

export function issueJson(db: Database, origin: string, repo: { full: string; name: string; owner: string; id: number }, i: IssueRow) {
	const assignees = issueAssignees(db, i.id);
	const m = i.milestone_id ? db.query<MilestoneRow, [number]>('select * from milestones where id = ?').get(i.milestone_id) : null;
	const comments = db.query<{ n: number }, [number]>('select count(*) as n from comments where issue_id = ? and review_id is null').get(i.id)!.n;
	const pull = i.is_pull ? db.query<{ merged_at: string | null; draft: number }, [number]>('select merged_at, draft from pulls where issue_id = ?').get(i.id) : null;
	const kind = i.is_pull ? 'pulls' : 'issues';
	return {
		id: i.id,
		number: i.number,
		title: i.title,
		body: i.body,
		state: i.state,
		user: userJson(db, i.user_id)!,
		labels: issueLabels(db, i.id),
		assignee: assignees[0] ?? null,
		assignees: assignees.length ? assignees : null,
		milestone: m ? milestoneJson(db, m) : null,
		comments,
		created_at: i.created_at,
		updated_at: i.updated_at,
		closed_at: i.closed_at,
		due_date: i.due_on,
		is_locked: !!i.locked,
		pull_request: pull ? { merged: !!pull.merged_at, merged_at: pull.merged_at, draft: !!pull.draft, html_url: `${origin}/${repo.full}/pulls/${i.number}` } : null,
		repository: { id: repo.id, name: repo.name, owner: repo.owner, full_name: repo.full },
		html_url: `${origin}/${repo.full}/${kind}/${i.number}`,
		url: `${origin}/api/v1/repos/${repo.full}/issues/${i.number}`
	};
}

export function commentJson(db: Database, origin: string, full: string, number: number, c: CommentRow) {
	return {
		id: c.id,
		body: c.body,
		user: userJson(db, c.user_id)!,
		created_at: c.created_at,
		updated_at: c.updated_at,
		html_url: `${origin}/${full}/issues/${number}#issuecomment-${c.id}`,
		issue_url: `${origin}/${full}/issues/${number}`,
		assets: []
	};
}

// A line comment: Forgejo calls the new-side line `position` and the old-side line `original_position`.
export function reviewCommentJson(db: Database, origin: string, full: string, number: number, c: CommentRow) {
	return {
		...commentJson(db, origin, full, number, c),
		pull_request_review_id: c.review_id,
		path: c.path,
		position: c.side === 'new' ? c.line : 0,
		original_position: c.side === 'old' ? c.line : 0,
		commit_id: c.commit_sha,
		original_commit_id: c.commit_sha,
		diff_hunk: c.diff_hunk ?? '',
		resolver: userJson(db, c.resolved_by),
		html_url: `${origin}/${full}/pulls/${number}/files#issuecomment-${c.id}`
	};
}

export function reviewJson(db: Database, r: ReviewRow, headSha: string) {
	const n = db.query<{ n: number }, [number]>('select count(*) as n from comments where review_id = ?').get(r.id)!.n;
	return {
		id: r.id,
		body: r.body,
		user: userJson(db, r.user_id)!,
		state: r.state,
		commit_id: r.commit_sha,
		submitted_at: r.created_at,
		updated_at: r.created_at,
		// A review of an older head is stale once new commits land.
		stale: !!r.commit_sha && r.commit_sha !== headSha,
		dismissed: !!r.dismissed,
		official: r.state === 'APPROVED' || r.state === 'REQUEST_CHANGES',
		comments_count: n
	};
}

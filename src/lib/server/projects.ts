import type { Database } from 'bun:sqlite';
import { error } from '@sveltejs/kit';

// Project boards: a repo's projects, each with ordered columns of cards (an issue/PR of the repo, or a note).
// Positions are floats so a card can be dropped between two others without renumbering.

export type Project = { id: number; repo_id: number; title: string; description: string; state: 'open' | 'closed'; created_at: string };
type Column = { id: number; project_id: number; title: string; position: number };
type Card = { id: number; column_id: number; issue_id: number | null; note: string; position: number };

export function listProjects(db: Database, repoId: number) {
	return db
		.query<Project & { cards: number; done: number }, [number]>(
			`select p.*, (select count(*) from project_cards c join project_columns k on k.id = c.column_id where k.project_id = p.id) as cards,
				(select count(*) from project_cards c join project_columns k on k.id = c.column_id join issues i on i.id = c.issue_id where k.project_id = p.id and i.state = 'closed') as done
			from projects p where p.repo_id = ? order by p.state, p.id desc`
		)
		.all(repoId);
}

export function getProject(db: Database, repoId: number, id: number) {
	return db.query<Project, [number, number]>('select * from projects where id = ? and repo_id = ?').get(id, repoId) ?? error(404, 'Project not found');
}

export function createProject(db: Database, repoId: number, title: string, description = '', template = true) {
	if (!title.trim()) error(400, 'Give the project a title');
	const id = Number(db.query('insert into projects (repo_id, title, description) values (?, ?, ?)').run(repoId, title.trim(), description).lastInsertRowid);
	if (template) ['To do', 'In progress', 'Done'].forEach((t, i) => db.query('insert into project_columns (project_id, title, position) values (?, ?, ?)').run(id, t, i));
	return id;
}

export function board(db: Database, projectId: number) {
	const columns = db.query<Column, [number]>('select * from project_columns where project_id = ? order by position, id').all(projectId);
	const cards = db
		.query<Card & { number: number | null; title: string | null; state: string | null; is_pull: number | null; merged: string | null }, [number]>(
			`select c.*, i.number, i.title, i.state, i.is_pull, p.merged_at as merged from project_cards c join project_columns k on k.id = c.column_id
			left join issues i on i.id = c.issue_id left join pulls p on p.issue_id = i.id where k.project_id = ? order by c.position, c.id`
		)
		.all(projectId);
	return columns.map((col) => ({ ...col, cards: cards.filter((c) => c.column_id === col.id) }));
}

const columnOf = (db: Database, projectId: number, id: number) =>
	db.query<Column, [number, number]>('select * from project_columns where id = ? and project_id = ?').get(id, projectId) ?? error(404, 'Column not found');
const cardOf = (db: Database, projectId: number, id: number) =>
	db.query<Card, [number, number]>('select c.* from project_cards c join project_columns k on k.id = c.column_id where c.id = ? and k.project_id = ?').get(id, projectId) ??
	error(404, 'Card not found');

export function addColumn(db: Database, projectId: number, title: string) {
	if (!title.trim()) error(400, 'Name the column');
	const max = db.query<{ m: number | null }, [number]>('select max(position) as m from project_columns where project_id = ?').get(projectId)!.m ?? -1;
	db.query('insert into project_columns (project_id, title, position) values (?, ?, ?)').run(projectId, title.trim(), max + 1);
}
export const renameColumn = (db: Database, projectId: number, id: number, title: string) => db.query('update project_columns set title = ? where id = ?').run(title.trim() || columnOf(db, projectId, id).title, columnOf(db, projectId, id).id);
export const deleteColumn = (db: Database, projectId: number, id: number) => db.query('delete from project_columns where id = ?').run(columnOf(db, projectId, id).id);

// An issue or PR by number (with or without #), or else a note.
export function addCard(db: Database, repoId: number, projectId: number, columnId: number, text: string) {
	const col = columnOf(db, projectId, columnId);
	const n = text.trim().match(/^#?(\d+)$/)?.[1];
	const issue = n ? db.query<{ id: number }, [number, number]>('select id from issues where repo_id = ? and number = ?').get(repoId, Number(n)) : null;
	if (n && !issue) error(404, `There's no #${n} in this repo`);
	if (!issue && !text.trim()) error(400, 'Write a note or give an issue number');
	if (issue && db.query('select 1 from project_cards c join project_columns k on k.id = c.column_id where k.project_id = ? and c.issue_id = ?').get(projectId, issue.id))
		error(409, `#${n} is already on this board`);
	const max = db.query<{ m: number | null }, [number]>('select max(position) as m from project_cards where column_id = ?').get(col.id)!.m ?? -1;
	db.query('insert into project_cards (column_id, issue_id, note, position) values (?, ?, ?, ?)').run(col.id, issue?.id ?? null, issue ? '' : text.trim(), max + 1);
}

// Moves a card to a column, before the card `before` (or to the end).
export function moveCard(db: Database, projectId: number, id: number, columnId: number, before?: number) {
	const card = cardOf(db, projectId, id);
	const col = columnOf(db, projectId, columnId);
	const rest = db.query<{ id: number; position: number }, [number, number]>('select id, position from project_cards where column_id = ? and id != ? order by position, id').all(col.id, card.id);
	const i = before ? rest.findIndex((c) => c.id === before) : -1;
	const position = i < 0 ? (rest.at(-1)?.position ?? -1) + 1 : i === 0 ? rest[0].position - 1 : (rest[i - 1].position + rest[i].position) / 2;
	db.query('update project_cards set column_id = ?, position = ? where id = ?').run(col.id, position, card.id);
}
export const deleteCard = (db: Database, projectId: number, id: number) => db.query('delete from project_cards where id = ?').run(cardOf(db, projectId, id).id);

import { beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { openDb } from './db.js';
import { addCard, addColumn, board, createProject, deleteCard, listProjects, moveCard } from './projects.js';

let db: Database, repo: number;
beforeEach(() => {
	db = openDb(':memory:');
	const u = Number(db.query("insert into users (login) values ('ada')").run().lastInsertRowid);
	repo = Number(db.query("insert into repos (owner_id, name) values (?, 'r')").run(u).lastInsertRowid);
	db.query("insert into issues (repo_id, number, user_id, title) values (?, 1, ?, 'First')").run(repo, u);
	db.query("insert into issues (repo_id, number, user_id, title, state) values (?, 2, ?, 'Second', 'closed')").run(repo, u);
});

test('boards: columns, issue and note cards, moving, counting', () => {
	const p = createProject(db, repo, 'Launch');
	const [todo, doing, done] = board(db, p);
	expect([todo.title, doing.title, done.title]).toEqual(['To do', 'In progress', 'Done']);
	addCard(db, repo, p, todo.id, '#1');
	addCard(db, repo, p, todo.id, '2');
	addCard(db, repo, p, todo.id, 'Write the announcement');
	expect(() => addCard(db, repo, p, todo.id, '#1')).toThrow();
	expect(() => addCard(db, repo, p, todo.id, '#9')).toThrow();
	const [a, b, note] = board(db, p)[0].cards;
	expect([a.title, b.title, note.note]).toEqual(['First', 'Second', 'Write the announcement']);
	moveCard(db, p, note.id, todo.id, a.id);
	expect(board(db, p)[0].cards.map((c) => c.id)).toEqual([note.id, a.id, b.id]);
	moveCard(db, p, b.id, done.id);
	moveCard(db, p, a.id, todo.id, note.id);
	expect(board(db, p)[0].cards.map((c) => c.id)).toEqual([a.id, note.id]);
	expect(listProjects(db, repo)[0]).toMatchObject({ cards: 3, done: 1 });
	deleteCard(db, p, note.id);
	addColumn(db, p, 'Later');
	expect(board(db, p).map((c) => c.title)).toEqual(['To do', 'In progress', 'Done', 'Later']);
});

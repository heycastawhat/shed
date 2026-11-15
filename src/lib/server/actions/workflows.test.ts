import { expect, test } from 'bun:test';
import YAML from 'yaml';
import { expandMatrix, fires, matches, parseWorkflow, planJobs } from './workflows.js';

test('filter patterns', () => {
	expect(matches(['main'], 'main')).toBe(true);
	expect(matches(['release/*'], 'release/1.0')).toBe(true);
	expect(matches(['release/*'], 'release/1/x')).toBe(false);
	expect(matches(['**'], 'a/b/c')).toBe(true);
	expect(matches(['feature/**', '!feature/skip'], 'feature/skip')).toBe(false);
	expect(matches(['v[12].*'], 'v1.0')).toBe(true);
});

test('which events fire', () => {
	expect(fires('push', { event: 'push', ref: 'refs/heads/x' })).toBe(true);
	expect(fires(['push', 'pull_request'], { event: 'pull_request', action: 'opened', base: 'main' })).toBe(true);
	const on = { push: { branches: ['main'] }, pull_request: { types: ['opened'], branches: ['main'] } };
	expect(fires(on, { event: 'push', ref: 'refs/heads/main' })).toBe(true);
	expect(fires(on, { event: 'push', ref: 'refs/heads/dev' })).toBe(false);
	expect(fires(on, { event: 'push', ref: 'refs/tags/v1' })).toBe(false);
	expect(fires(on, { event: 'pull_request', action: 'synchronize', base: 'main' })).toBe(false);
	expect(fires({ push: { tags: ['v*'] } }, { event: 'push', ref: 'refs/tags/v1' })).toBe(true);
	expect(fires({ push: { tags: ['v*'] } }, { event: 'push', ref: 'refs/heads/main' })).toBe(false);
	expect(fires({ push: { paths: ['src/**'] } }, { event: 'push', ref: 'refs/heads/main', files: ['README.md'] })).toBe(false);
	expect(fires({ push: { 'paths-ignore': ['docs/**'] } }, { event: 'push', ref: 'refs/heads/main', files: ['src/a.ts'] })).toBe(true);
	expect(fires({ push: null, workflow_dispatch: null }, { event: 'workflow_dispatch' })).toBe(true);
});

test('matrix expansion', () => {
	expect(expandMatrix({ os: ['a', 'b'], v: [1, 2] })).toHaveLength(4);
	expect(expandMatrix({ os: ['a', 'b'], v: [1, 2], exclude: [{ os: 'a', v: 2 }] })).toHaveLength(3);
	expect(expandMatrix({ os: ['a'], include: [{ os: 'a', extra: true }, { os: 'z' }] })).toEqual([{ os: 'a', extra: true }, { os: 'z' }]);
	expect(expandMatrix(undefined)).toEqual([{}]);
});

test('jobs become single-job workflows', () => {
	const w = parseWorkflow(`
name: CI
on:
  push:
env: { A: '1' }
jobs:
  lint:
    runs-on: host
    steps: [{ run: echo lint }]
  test:
    needs: lint
    if: always()
    strategy: { matrix: { node: [20, 22] } }
    runs-on: \${{ matrix.node == 20 && 'host' || 'host' }}
    steps: [{ run: echo test }]
`);
	const jobs = planJobs(w);
	expect(jobs.map((j) => j.name)).toEqual(['lint', 'test (20)', 'test (22)']);
	expect(jobs[1]).toMatchObject({ key: 'test', needs: ['lint'], always: true });
	const single = YAML.parse(jobs[2].payload);
	expect(Object.keys(single.jobs)).toEqual(['test']);
	expect(single.jobs.test.strategy.matrix).toEqual({ node: [22] });
	expect(single.env).toEqual({ A: '1' });
	expect(single.on).toEqual({ push: null });
});

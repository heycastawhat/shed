import { expect, test } from 'bun:test';
import YAML from 'yaml';
import { expandMatrix, fires, inputsOf, matches, parseWorkflow, planJobs, runsOn } from './workflows.js';

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

test('globstar directories match root files as well as nested files in push filters', () => {
	const w = parseWorkflow('on:\n  push:\n    paths: ["**/*.ts"]\njobs:\n  test:\n    runs-on: host\n    steps: []\n');
	for (const file of ['index.ts', 'src/index.ts', 'src/lib/index.ts']) {
		expect(matches(['**/*.ts'], file)).toBe(true);
		expect(fires(w.on, { event: 'push', ref: 'refs/heads/main', files: [file] })).toBe(true);
	}
	expect(fires(w.on, { event: 'push', ref: 'refs/heads/main', files: [] })).toBe(false);
	expect(fires(w.on, { event: 'push', ref: 'refs/heads/main', files: ['index.js'] })).toBe(false);
	expect(matches(['src/**/*.ts'], 'src/index.ts')).toBe(true);
	expect(matches(['**/*.ts', '!**/skip.ts'], 'skip.ts')).toBe(false);
	expect(matches(['**/*.ts', '!**/skip.ts'], 'src/skip.ts')).toBe(false);
});

test('matrix expansion', () => {
	expect(expandMatrix({ os: ['a', 'b'], v: [1, 2] })).toHaveLength(4);
	expect(expandMatrix({ os: ['a', 'b'], v: [1, 2], exclude: [{ os: 'a', v: 2 }] })).toHaveLength(3);
	expect(expandMatrix({ os: ['a'], include: [{ os: 'a', extra: true }, { os: 'z' }] })).toEqual([{ os: 'a', extra: true }, { os: 'z' }]);
	expect(expandMatrix(undefined)).toEqual([{}]);
});

test('include-only matrices create a separate job for every entry', () => {
	const include = [{ os: 'linux' }, { os: 'windows' }];
	expect(expandMatrix({ include })).toEqual(include);
	expect(expandMatrix({ include: [{ os: 'linux' }, { os: 'linux' }] })).toEqual([{ os: 'linux' }, { os: 'linux' }]);
	const w = parseWorkflow('on: workflow_dispatch\njobs:\n  included:\n    runs-on: "${{ matrix.os }}"\n    strategy:\n      matrix:\n        include: [{ os: linux }, { os: windows }]\n    steps: [{ run: echo included }]\n');
	expect(planJobs(w).map(({ name, runsOn }) => ({ name, runsOn }))).toEqual([
		{ name: 'included (linux)', runsOn: ['linux'] },
		{ name: 'included (windows)', runsOn: ['windows'] }
	]);
	expect(expandMatrix({ include: [] })).toEqual([{}]);
	expect(expandMatrix({ os: ['linux', 'windows'], include: [{ extra: true }, { os: 'linux', extra: false }, { os: 'mac' }] })).toEqual([
		{ os: 'linux', extra: false }, { os: 'windows', extra: true }, { os: 'mac' }
	]);
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

test('empty axes or fully excluded matrices do not plan a fallback job', () => {
	const w = parseWorkflow('on: push\njobs:\n  test:\n    runs-on: host\n    strategy:\n      matrix:\n        os: [linux]\n        exclude:\n          - os: linux\n    steps: []\n');
	expect(planJobs(w)).toEqual([]);
	expect(expandMatrix({ os: [] })).toEqual([]);
	expect(expandMatrix({ include: [] })).toEqual([{}]);
	expect(expandMatrix({ os: ['linux'], exclude: [{ os: 'linux' }], include: [{ os: 'mac' }] })).toEqual([{ os: 'mac' }]);
	expect(expandMatrix({})).toEqual([{}]);
	for (const matrix of [{}, { include: [] }]) {
		expect(planJobs({ jobs: { test: { 'runs-on': 'host', strategy: { matrix }, steps: [] } } })).toHaveLength(1);
	}
	expect(planJobs({ jobs: { test: { 'runs-on': 'host', steps: [] } } })).toHaveLength(1);
});

test('runs-on resolves matrix, vars, inputs, fromJSON and lists', () => {
	const ctx = { matrix: { os: 'arm', set: ['a', 'b'] }, vars: { RUNNER: 'host', LABELS: '["x","y"]' }, inputs: { pool: 'big' } };
	expect(runsOn('host', ctx)).toEqual(['host']);
	expect(runsOn('${{ matrix.os }}', ctx)).toEqual(['arm']);
	expect(runsOn('${{ matrix.set }}', ctx)).toEqual(['a', 'b']);
	expect(runsOn('${{ vars.RUNNER }}', ctx)).toEqual(['host']);
	expect(runsOn('${{ fromJSON(vars.LABELS) }}', ctx)).toEqual(['x', 'y']);
	expect(runsOn(`\${{ fromJSON('["p", "q"]') }}`, ctx)).toEqual(['p', 'q']);
	expect(runsOn(['self-hosted', '${{ inputs.pool }}', '${{ github.event.inputs.pool }}-2'], ctx)).toEqual(['self-hosted', 'big', 'big-2']);
	expect(runsOn({ group: 'g', labels: ['${{ vars.RUNNER }}'] }, ctx)).toEqual(['host']);
	expect(runsOn('${{ vars.MISSING }}', ctx)).toEqual(['']);
	expect(runsOn("${{ matrix.os == 'arm' && 'a' || 'b' }}", ctx)).toEqual(["${{ matrix.os == 'arm' && 'a' || 'b' }}"]);
});

test('dispatch inputs fall back to the declared defaults and reach runs-on', () => {
	const w = parseWorkflow(`
on:
  workflow_dispatch:
    inputs:
      pool: { default: small }
      size: { default: '1' }
jobs:
  build:
    name: build on \${{ inputs.pool }}
    runs-on: \${{ inputs.pool }}
    steps: [{ run: echo }]
`);
	expect(inputsOf(w, { size: '2' })).toEqual({ pool: 'small', size: '2' });
	expect(planJobs(w, { inputs: inputsOf(w, { pool: 'big' }) })[0]).toMatchObject({ name: 'build on big', runsOn: ['big'] });
	expect(inputsOf(parseWorkflow('on: push\njobs: {}'), undefined)).toEqual({});
});

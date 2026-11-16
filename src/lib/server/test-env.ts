// What tests that load modules reading Kit's env give `$app/env/private` (mock.module), so a new variable is added in one place.
export const testEnv = () => ({
	FORGE_DATA: `/tmp/shed-test-forge-${crypto.randomUUID()}`,
	FORGE_SECRET: 'x'.repeat(40),
	T3_URL: '',
	T3_TOKEN: '',
	SHED_DATA: `/tmp/shed-test-${crypto.randomUUID()}`,
	SHED_ALLOWED_USERS: 'user:x',
	SHED_OIDC_ISSUER: 'http://x',
	SHED_OIDC_CLIENT_ID: 'x',
	SHED_OIDC_CLIENT_SECRET: 'x',
	SHED_SSH_PORT: 0,
	SHED_SSH_URL: '',
	SHED_ACTIONS_URL: '',
	SHED_RUNNER_TOKEN: '',
	SHED_SMTP_URL: undefined,
	SHED_MAIL_FROM: undefined
});

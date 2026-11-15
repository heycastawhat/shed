import { redirect } from '@sveltejs/kit';

// Commit statuses link here; the run page shows the job.
export function load({ params }) {
	redirect(303, `/${params.owner}/${params.repo}/actions/runs/${params.run}?job=${params.job}`);
}

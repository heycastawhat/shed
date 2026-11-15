import { redirect } from '@sveltejs/kit';

// The API's html_url for a release; the list shows every release, so jump to this one there.
export function GET({ params }) {
	redirect(303, `/${params.owner}/${params.repo}/releases#release-${encodeURIComponent(params.tag)}`);
}

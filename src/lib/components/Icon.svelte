<script lang="ts" module>
	import IHome4 from '@mingcute/svelte/core-regular/home-4';
	import IGitMerge from '@mingcute/svelte/core-regular/git-merge';
	import ICode from '@mingcute/svelte/core-regular/code';
	import IGitCommit from '@mingcute/svelte/core-regular/git-commit';
	import IGitBranch from '@mingcute/svelte/core-regular/git-branch';
	import IFile from '@mingcute/svelte/core-regular/file';
	import IFolder from '@mingcute/svelte/core-regular/folder';
	import IFileMore from '@mingcute/svelte/core-regular/file-more';
	import IInbox from '@mingcute/svelte/core-regular/inbox';
	import IChat1 from '@mingcute/svelte/core-regular/chat-1';
	import ILock from '@mingcute/svelte/core-regular/lock';
	import IUser3 from '@mingcute/svelte/core-regular/user-3';
	import IFlag2 from '@mingcute/svelte/core-regular/flag-2';
	import IComputer from '@mingcute/svelte/core-regular/computer';
	import IMoon from '@mingcute/svelte/core-regular/moon';
	import IPalette from '@mingcute/svelte/core-regular/palette';
	import ISun from '@mingcute/svelte/core-regular/sun';
	import IPin from '@mingcute/svelte/core-regular/pin';
	import IGitPullRequest from '@mingcute/svelte/core-regular/git-pull-request';
	import IFolder2 from '@mingcute/svelte/core-regular/folder-2';
	import IRobot from '@mingcute/svelte/core-regular/robot';
	import ISearch from '@mingcute/svelte/core-regular/search';
	import IAdd from '@mingcute/svelte/core-regular/add';
	import IClose from '@mingcute/svelte/core-regular/close';
	import ILeft from '@mingcute/svelte/core-regular/left';
	import IRight from '@mingcute/svelte/core-regular/right';
	import ISettings6 from '@mingcute/svelte/core-regular/settings-6';
	import ILayoutLeftbarOpen from '@mingcute/svelte/core-regular/layout-leftbar-open';
	import ICheck from '@mingcute/svelte/core-regular/check';
	import ITime from '@mingcute/svelte/core-regular/time';
	import IExternalLink from '@mingcute/svelte/core-regular/external-link';
	import IDown from '@mingcute/svelte/core-regular/down';
	import IRadiobox from '@mingcute/svelte/core-regular/radiobox';
	import ICheckCircle from '@mingcute/svelte/core-regular/check-circle';
	import ITag from '@mingcute/svelte/core-regular/tag';
	import IPencil from '@mingcute/svelte/core-regular/pencil';
	import IFilter from '@mingcute/svelte/core-regular/filter';
	import IDelete2 from '@mingcute/svelte/core-regular/delete-2';
	import IDownload from '@mingcute/svelte/core-regular/download';
	import IPackage from '@mingcute/svelte/core-regular/package';
	import IFileZip from '@mingcute/svelte/core-regular/file-zip';
	import IStar from '@mingcute/svelte/core-regular/star';
	import ILocation from '@mingcute/svelte/core-regular/location';
	import ILink from '@mingcute/svelte/core-regular/link';
	import ICalendar from '@mingcute/svelte/core-regular/calendar';
	import IFork from '@mingcute/svelte/core-regular/fork';
	import IGroup from '@mingcute/svelte/core-regular/group';

	const ICONS = {
		home: IHome4,
		merge: IGitMerge,
		code: ICode,
		commit: IGitCommit,
		branch: IGitBranch,
		file: IFile,
		folder: IFolder,
		diff: IFileMore,
		inbox: IInbox,
		message: IChat1,
		lock: ILock,
		user: IUser3,
		milestone: IFlag2,
		monitor: IComputer,
		moon: IMoon,
		palette: IPalette,
		sun: ISun,
		pin: IPin,
		changes: IGitPullRequest,
		repos: IFolder2,
		agents: IRobot,
		search: ISearch,
		plus: IAdd,
		unpin: IClose,
		left: ILeft,
		right: IRight,
		sliders: ISettings6,
		layout: ILayoutLeftbarOpen,
		check: ICheck,
		clock: ITime,
		external: IExternalLink,
		chevron: IDown,
		x: IClose,
		issue: IRadiobox,
		done: ICheckCircle,
		tag: ITag,
		pencil: IPencil,
		filter: IFilter,
		trash: IDelete2,
		download: IDownload,
		release: IPackage,
		zip: IFileZip,
		star: IStar,
		location: ILocation,
		link: ILink,
		calendar: ICalendar,
		fork: IFork,
		group: IGroup
	};
</script>

<script lang="ts">
	let { name, size = 16 }: { name: keyof typeof ICONS | (string & {}); size?: number } = $props();
	const Svg = $derived(ICONS[name as keyof typeof ICONS]);
</script>

<Svg {size} style="flex: none" />

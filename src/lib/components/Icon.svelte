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
	import IPlayCircle from '@mingcute/svelte/core-regular/play-circle';
	import IBook2 from '@mingcute/svelte/core-regular/book-2';
	import IChartBar from '@mingcute/svelte/core-regular/chart-bar';
	import INotification from '@mingcute/svelte/core-regular/notification';
	import IEye2 from '@mingcute/svelte/core-regular/eye-2';
	import IUpload2 from '@mingcute/svelte/core-regular/upload-2';
	import IHistory from '@mingcute/svelte/core-regular/history';
	import ICopy2 from '@mingcute/svelte/core-regular/copy-2';
	import IKey2 from '@mingcute/svelte/core-regular/key-2';
	import IWebhook from '@mingcute/svelte/core-regular/webhook';
	import IShield from '@mingcute/svelte/core-regular/shield';
	import IArchive from '@mingcute/svelte/core-regular/archive';
	import ICompass from '@mingcute/svelte/core-regular/compass';
	import ITransfer from '@mingcute/svelte/core-regular/transfer';
	import IRefresh2 from '@mingcute/svelte/core-regular/refresh-2';
	import ILayoutGrid from '@mingcute/svelte/core-regular/layout-grid';
	import IPackage2 from '@mingcute/svelte/core-regular/package-2';
	import IGlobe from '@mingcute/svelte/core-regular/globe';
	import IEdit2 from '@mingcute/svelte/core-regular/edit-2';
	import IStar from '@mingcute/svelte/core-regular/star';
	import ILocation from '@mingcute/svelte/core-regular/location';
	import ILink from '@mingcute/svelte/core-regular/link';
	import ICalendar from '@mingcute/svelte/core-regular/calendar';
	import IFork from '@mingcute/svelte/core-regular/fork';
	import IGroup from '@mingcute/svelte/core-regular/group';
	import IMenu from '@mingcute/svelte/core-regular/menu';
	import IEmoji from '@mingcute/svelte/core-regular/emoji';
	import IQuoteLeft from '@mingcute/svelte/core-regular/quote-left';
	import IMore1 from '@mingcute/svelte/core-regular/more-1';
	import IUnlock from '@mingcute/svelte/core-regular/unlock';
	import INotificationOff from '@mingcute/svelte/core-regular/notification-off';
	import IMailOpen from '@mingcute/svelte/core-regular/mail-open';

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
		group: IGroup,
		menu: IMenu,
		actions: IPlayCircle,
		wiki: IBook2,
		activity: IChartBar,
		bell: INotification,
		eye: IEye2,
		upload: IUpload2,
		history: IHistory,
		copy: ICopy2,
		key: IKey2,
		webhook: IWebhook,
		shield: IShield,
		archive: IArchive,
		explore: ICompass,
		transfer: ITransfer,
		refresh: IRefresh2,
		projects: ILayoutGrid,
		packages: IPackage2,
		globe: IGlobe,
		edit: IEdit2,
		emoji: IEmoji,
		quote: IQuoteLeft,
		more: IMore1,
		unlock: IUnlock,
		'bell-off': INotificationOff,
		read: IMailOpen
	};
</script>

<script lang="ts">
	let { name, size = 16 }: { name: keyof typeof ICONS | (string & {}); size?: number } = $props();
	const Svg = $derived(ICONS[name as keyof typeof ICONS]);
</script>

<Svg {size} style="flex: none" />

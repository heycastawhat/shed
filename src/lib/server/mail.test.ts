import { expect, test } from 'bun:test';
import { sendMail, setMailer } from './mail.js';

// A tiny SMTP server that records one message.
test('notification mail goes out over SMTP', async () => {
	let got = '';
	const done = Promise.withResolvers<void>();
	const server = Bun.listen<{ data: boolean }>({
		hostname: '127.0.0.1',
		port: 0,
		socket: {
			open: (s) => ((s.data = { data: false }), s.write('220 test\r\n')),
			data(s, buf) {
				const text = new TextDecoder().decode(buf);
				if (s.data.data) {
					got += text;
					if (got.includes('\r\n.\r\n')) (s.data.data = false), s.write('250 ok\r\n'), done.resolve();
					return;
				}
				for (const line of text.split('\r\n').filter(Boolean)) {
					if (/^EHLO/i.test(line)) s.write('250-test\r\n250 OK\r\n');
					else if (/^DATA/i.test(line)) (s.data.data = true), s.write('354 go\r\n');
					else if (/^QUIT/i.test(line)) s.write('221 bye\r\n'), s.end();
					else s.write('250 ok\r\n');
				}
			}
		}
	});
	setMailer(`smtp://127.0.0.1:${server.port}`, 'Shed <shed@test>');
	sendMail('ada@test', '[ada/sample] Hello (#1)', 'reviewer commented.\n\nhttp://shed/ada/sample/issues/1', { References: '<x@shed>' });
	await done.promise;
	server.stop(true);
	setMailer(undefined, undefined);
	expect(got).toContain('Subject: [ada/sample] Hello (#1)');
	expect(got).toContain('To: ada@test');
	expect(got).toContain('References: <x@shed>');
	expect(got).toContain('reviewer commented.');
});

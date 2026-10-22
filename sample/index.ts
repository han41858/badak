import { Badak } from '../src/index';
import { createApp } from './app';


const port: number = 9000;

(async (): Promise<void> => {
	const app: Badak = await createApp({
		token: process.env.API_TOKEN ?? 'secret',
		log: (line: string): void => console.log(line)
	});

	await app.listen(port);

	console.log(`badak sample is listening... [port : ${ port }]`);
	console.log(`curl -H 'Authorization: Bearer secret' -H 'Content-Type: application/json' -d '{"name":"han"}' localhost:${ port }/api/users`);
})()
	.catch((err: Error): void => {
		console.error('badak sample failed :', err.message);
		process.exitCode = 1;
	});

import { Badak } from '../src/badak';
import { ParamContext } from '../src/interfaces';

const getUserList = async (): Promise<{ list: string[] }> => {
	return {
		list: ['han', 'kim', 'lee']
	};
};

const addUser = async ({ body }: ParamContext): Promise<{ result: string }> => {
	console.log('addUser()', body);

	return {
		result: 'ok'
	};
};

const port = 9000;
const app: Badak = new Badak();

(async (): Promise<void> => {
	await app.route({
		'users': {
			'GET': getUserList,
			'POST': addUser
		}
	});

	await app.listen(port);
})()
	.then(() => {
		console.log(`Badak is listening... [port : ${ port }]`);
	}, (err) => {
		console.error('Badak listen failed :', err.message);
	});

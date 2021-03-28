import { Badak } from '../src/badak';

const getUserList = async () => {
	return {
		list : ['han', 'kim', 'lee']
	};
};

const addUser = async (param : unknown) => {
	console.log('addUser()', param);

	return {
		result : 'ok'
	};
};

const port = 9000;
const app : Badak = new Badak();

(async () => {
	await app.route({
		'users' : {
			'GET' : getUserList,
			'POST' : addUser
		}
	});

	await app.listen(port);
})()
	.then(() => {
		console.log(`Badak is listening... [port : ${ port }]`);
	}, (err) => {
		console.error('Badak listen failed :', err.message);
	});

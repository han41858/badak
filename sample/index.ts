import { Badak } from '../src/badak';

const getUserList = async () => {
	return {
		list : ['han', 'kim', 'lee']
	};
};

const addUser = async (param) => {
	console.log('addUser()', param);

	return {
		result : 'ok'
	};
};

const port = 9000;
const app = new Badak;

app.route({
		'users' : {
			'GET' : getUserList,
			'POST' : addUser
		}
	})
	.then(() => {
		// console.log(app._routeRule);
		return app.listen(port);
	})
	.then(() => {
		console.log(`Badak is listening... [port : ${ port }]`);
	})
	.catch((err) => {
		console.error('Badak listen failed :', err.message);
	});
export class Badak {
	async listen (port : number) : Promise<any> {
		if (port === undefined) {
			throw new Error('port should be passed');
		}

		if (typeof port !== 'number') {
			throw new Error('port should be number type');
		}

		return {};
	}
}
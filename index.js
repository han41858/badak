class Badak {
	constructor () {
		console.log('Badak.constructor()');
	}

	listen (port) {
		console.log('Badak.listen()', port);
	}
}

exports = module.exports = Badak;
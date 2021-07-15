// cp -rf spec/static build/spec/static
const { existsSync, mkdirSync, copyFileSync, readdirSync, lstatSync } = require('fs');

const cp = (src, dest) => {
	if (existsSync(src)) {
		if (!existsSync(dest)) {
			mkdirSync(dest);
		}
		
		const files = readdirSync(src);
		
		files.forEach(fileOrDir => {
			const stats = lstatSync(`${src}/${fileOrDir}`);
			
			if (stats.isDirectory()) {
				// call recursively
				cp(`${src}/${fileOrDir}`, `${dest}/${fileOrDir}`);
			}
			else {
				copyFileSync(`${src}/${fileOrDir}`, `${dest}/${fileOrDir}`);
			}
		});
	}
	else {
		throw new Error(`no src path: ${src}`);
	}
};

cp('./spec/static', './build/spec/static');

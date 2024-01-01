import { join } from 'node:path';
import { Dirent } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';

// patch targets
// cjs: const interfaces_1 = require("./interfaces");
// esm: import { EjvError } from './interfaces';

console.log('* add-js-extensions');

(async (): Promise<void> => {
	// get all .js file in build folder
	const buildFolder: string = join('.', 'build');
	const folderNames: string[] = (await readdir(buildFolder, { withFileTypes: true }))
		.filter((one: Dirent): boolean => one.isDirectory())
		.map((one: Dirent): string => one.name);

	const importStateRegExp = /['"]\.\/[a-z]+['"]/g;

	let modifiedFileCount: number = 0;
	let modifiedStrCount: number = 0;

	for await (const folder of folderNames) {
		const jsFilePaths: string[] = (await readdir(join(buildFolder, folder), { withFileTypes: true }))
			.filter((one: Dirent): boolean => one.isFile() && one.name.endsWith('.js'))
			.map((one: Dirent): string => join(buildFolder, folder, one.name));

		for await(const jsFilePath of jsFilePaths) {
			let fileContents: string = await readFile(jsFilePath, {
				encoding: 'utf-8'
			});

			const matchResults: RegExpMatchArray[] = [...fileContents.matchAll(importStateRegExp)];

			if (matchResults.length > 0) {
				for (let i = 0; i < matchResults.length; i++) {
					const oneResult: RegExpMatchArray = matchResults[i];

					const beforeStr: string = oneResult[0];
					const afterStr: string = beforeStr.endsWith('"')
						? beforeStr.replace(/"$/, '.js"')
						: beforeStr.replace(/'$/, '.js\'');

					fileContents = fileContents.replace(beforeStr, afterStr);

					++modifiedStrCount;
				}

				await writeFile(jsFilePath, fileContents, {
					encoding: 'utf-8'
				});

				++modifiedFileCount;
			}
		}
	}

	console.log(`${ modifiedStrCount } import statements in ${ modifiedFileCount } files patched`);
})();

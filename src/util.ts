// convert if number string
// if not number string, return itself
import * as fs from 'fs';
import { Stats } from 'fs';

import * as node_path from 'path';

import { StaticCache } from './interfaces';


export const convertNumberStr = (param : string) : string | number => {
	return !isNaN(+param)
		? +param
		: param;
};

// convert if date string
// if not date string, return itself
export const convertDateStr = (param : string) : string | Date => {
	let result : string | Date = param;

	// only work for ISO 8601 date format
	const dateExps : RegExp[] = [
		/^(\d){4}-(\d){2}-(\d){2}$/, // date : '2018-06-20'
		/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}\+(\d){2}:(\d){2}$/, // combined date and time in UTC : '2018-06-20T21:22:09+00:00'
		/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}(.(\d){3})?Z$/, // combined date and time in UTC : '2018-06-20T21:22:09Z', '2018-06-20T22:00:30.296Z'
		/^(\d){8}T(\d){6}Z$/, // combined date and time in UTC : '20180620T212209Z'
		/^(\d){4}-W(\d){2}$/, // week : '2018-W25'
		/^(\d){4}-W(\d){2}-(\d)$/, // date with week number : '2018-W25-3'
		/^--(\d){2}-(\d){2}$/, // date without year : '--06-20'
		/^(\d){4}-(\d){3}$/ // ordinal dates : '2018-171'
	];

	if (dateExps.some(dateExp => {
		return dateExp.test(param);
	})) {
		result = new Date(param);
	}

	return result;
};

export const checkAbsoluteUri = async (uri : string) : Promise<void> => {
	if (!uri) {
		throw new Error('no uri');
	}

	if (!uri.startsWith('/')) {
		throw new Error('uri should be start with slash(/)');
	}
};

export const checkAbsolutePath = async (path : string) : Promise<void> => {
	if (!path) {
		throw new Error('no path');
	}

	if (!node_path.isAbsolute(path)) {
		throw new Error('path should be absolute');
	}
};

export const isExistFile = async (path : string) : Promise<boolean> => {
	return new Promise<boolean>((resolve) => {
		fs.access(path, (err) => {
			if (!err) {
				resolve(true);
			} else {
				resolve(false);
			}
		});
	});
};

export const isFolder = async (path : string) : Promise<boolean> => {
	return new Promise<boolean>((resolve, reject) => {
		fs.stat(path, (err : Error | null, stats : Stats) => {
			if (!err) {
				resolve(stats.isDirectory());
			} else {
				reject(new Error(`_isFolder() failed : ${ path }`));
			}
		});
	});
};


export const loadFolder = async (uri : string, path : string) : Promise<StaticCache[]> => {
	const foldersAndFiles : string[] = await new Promise<string[]>((resolve, reject) => {
		fs.readdir(path, (err : Error | null, _foldersAndFiles : string[]) => {
			if (!err) {
				resolve(_foldersAndFiles);
			} else {
				reject(new Error(`loadFolder() failed : ${ path }`));
			}
		});
	});

	const cache : StaticCache[] = [];

	const allFileData : StaticCache[][] = await Promise.all(foldersAndFiles.map(async (folderOrFileName : string) : Promise<StaticCache[]> => {
		const uriSanitized : string = node_path
			.join(uri, folderOrFileName)
			.replace(/\\/g, '/'); // path \\ changed to /

		const fullPath : string = node_path.join(path, folderOrFileName);

		let cacheSet : StaticCache[];

		if (await isFolder(fullPath)) {
			// call recursively
			cacheSet = await loadFolder(uriSanitized, fullPath);

		} else {
			const matchArr : RegExpMatchArray | null = fullPath.match(/(\.[\w\d]+)?\.[\w\d]+$/);

			let mime = 'application/octet-stream'; // default

			if (matchArr) {
				const extension : string = matchArr[0];

				const mimeMap : {
					[key : string] : string;
				} = {
					'.bmp' : 'image/bmp',
					'.css' : 'text/css',
					'.gif' : 'image/gif',
					'.htm' : 'text/html',
					'.html' : 'text/html',
					'.jpeg' : 'image/jpeg',
					'.jpg' : 'image/jpeg',
					'.js' : 'text/javascript',
					'.json' : 'application/json',
					'.pdf' : 'application/pdf',
					'.png' : 'image/png',
					'.txt' : 'text/plain',
					'.text' : 'text/plain',
					'.tif' : 'image/tiff',
					'.tiff' : 'image/tiff',
					'.xls' : 'application/vnd.ms-excel',
					'.xlsx' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				};

				if (mimeMap[extension]) {
					mime = mimeMap[extension];
				}
			}

			cacheSet = [{
				uri : uriSanitized,
				mime : mime,
				fileData : await loadFile(fullPath)
			}];
		}

		return cacheSet;
	}));

	allFileData.forEach((oneFileData) => {
		cache.push(...oneFileData);
	});

	return cache;
};

const loadFile = async (path : string) : Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject) => {
		fs.readFile(path, (err : Error | null, data : Buffer) => {
			if (!err) {
				resolve(data);
			} else {
				reject(new Error(`loadFile() failed : ${ path }`));
			}
		});
	});
};

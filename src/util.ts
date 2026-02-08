// convert if number string
// if not number string, return itself
import * as fs from 'node:fs';
import { Stats } from 'node:fs';

import * as node_path from 'node:path';

import { StaticCache } from './interfaces';
import { CONTENT_TYPE } from './constants';


export const convertNumberStr = (param: string): string | number => {
	return !isNaN(+param)
		? +param
		: param;
};

// convert if date string
// if not date string, return itself
export const convertDateStr = (param: string): string | Date => {
	let result: string | Date = param;

	// only work for ISO 8601 date format
	const dateExps: RegExp[] = [
		/^(\d){4}-(\d){2}-(\d){2}$/, // date : '2018-06-20'
		/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}\+(\d){2}:(\d){2}$/, // combined date and time in UTC : '2018-06-20T21:22:09+00:00'
		/^(\d){4}-(\d){2}-(\d){2}T(\d){2}:(\d){2}:(\d){2}(.(\d){3})?Z$/, // combined date and time in UTC : '2018-06-20T21:22:09Z', '2018-06-20T22:00:30.296Z'
		/^(\d){8}T(\d){6}Z$/, // combined date and time in UTC : '20180620T212209Z'
		/^(\d){4}-W(\d){2}$/, // week : '2018-W25'
		/^(\d){4}-W(\d){2}-(\d)$/, // date with week number : '2018-W25-3'
		/^--(\d){2}-(\d){2}$/, // date without year : '--06-20'
		/^(\d){4}-(\d){3}$/ // ordinal dates : '2018-171'
	];


	if (dateExps.some((dateExp: RegExp): boolean => {
		return dateExp.test(param);
	})) {
		result = new Date(param);
	}

	return result;
};

export const checkAbsoluteUri = async (uri: string): Promise<void> => {
	if (!uri) {
		throw new Error('no uri');
	}

	if (!uri.startsWith('/')) {
		throw new Error('uri should be start with slash(/)');
	}
};

export const checkAbsolutePath = async (path: string): Promise<void> => {
	if (!path) {
		throw new Error('no path');
	}

	if (!node_path.isAbsolute(path)) {
		throw new Error('path should be absolute');
	}
};

export const isExistFile = async (path: string): Promise<boolean> => {
	return new Promise<boolean>((resolve) => {
		fs.access(path, (err) => {
			if (!err) {
				resolve(true);
			}
			else {
				resolve(false);
			}
		});
	});
};

export const isFolder = async (path: string): Promise<boolean> => {
	return new Promise<boolean>((resolve, reject) => {
		fs.stat(path, (err: Error | null, stats: Stats) => {
			if (!err) {
				resolve(stats.isDirectory());
			}
			else {
				reject(new Error(`_isFolder() failed : ${ path }`));
			}
		});
	});
};


export const loadFolder = async (uri: string, path: string): Promise<StaticCache[]> => {
	const foldersAndFiles: string[] = await new Promise<string[]>((resolve, reject) => {
		fs.readdir(path, (err: Error | null, _foldersAndFiles: string[]) => {
			if (!err) {
				resolve(_foldersAndFiles);
			}
			else {
				reject(new Error(`loadFolder() failed : ${ path }`));
			}
		});
	});

	const cache: StaticCache[] = [];

	const allFileData: StaticCache[][] = await Promise.all(foldersAndFiles.map(async (folderOrFileName: string): Promise<StaticCache[]> => {
		const uriSanitized: string = node_path
			.join(uri, folderOrFileName)
			.replace(/\\/g, '/'); // path \\ changed to /

		const fullPath: string = node_path.join(path, folderOrFileName);

		let cacheSet: StaticCache[];

		if (await isFolder(fullPath)) {
			// call recursively
			cacheSet = await loadFolder(uriSanitized, fullPath);
		}
		else {
			const fileData: Buffer<ArrayBufferLike> = await loadFile(fullPath);
			const mimeType: CONTENT_TYPE = getContentType(fileData, folderOrFileName);

			cacheSet = [{
				uri: uriSanitized,
				mime: mimeType,
				fileData: fileData
			}];
		}

		return cacheSet;
	}));

	allFileData.forEach((oneFileData) => {
		cache.push(...oneFileData);
	});

	return cache;
};

const loadFile = async (path: string): Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject) => {
		fs.readFile(path, (err: Error | null, data: Buffer) => {
			if (!err) {
				resolve(data);
			}
			else {
				reject(new Error(`loadFile() failed : ${ path }`));
			}
		});
	});
};


interface Signature {
	type: CONTENT_TYPE;
	sign: number[] | RegExp; // hex numbers or regular expression
}

export const getContentType = (data: unknown, fileName?: string): CONTENT_TYPE => {
	let contentType: CONTENT_TYPE | undefined;

	if (
		data !== null
		&& data !== undefined
	) {
		if (data instanceof Buffer) {
			const asBuffer: Buffer = data;
			const asStr: string = data.toString();

			const SignatureMap: Signature[] = [
				{ type: CONTENT_TYPE.IMAGE_ICO, sign: [0x00, 0x00, 0x01, 0x00] },
				{ type: CONTENT_TYPE.IMAGE_GIF, sign: [0x47, 0x49, 0x46, 0x38] },
				{ type: CONTENT_TYPE.IMAGE_JPEG, sign: [0xFF, 0xD8, 0xFF] },
				{ type: CONTENT_TYPE.IMAGE_BMP, sign: [0x42, 0x4D] },
				{ type: CONTENT_TYPE.IMAGE_PNG, sign: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
				{ type: CONTENT_TYPE.IMAGE_TIFF, sign: [0x49, 0x49, 0x2A, 0x00] }, // Intel
				{ type: CONTENT_TYPE.IMAGE_TIFF, sign: [0x4D, 0x4D, 0x00, 0x2A] }, // Motorola
				{ type: CONTENT_TYPE.IMAGE_WEBP, sign: /^RIFF....WEBP/ },
				{ type: CONTENT_TYPE.IMAGE_HEIC, sign: /^.{4}ftypheic/ },
				{ type: CONTENT_TYPE.IMAGE_HEIC, sign: /^.{4}ftypmif1/ },

				{ type: CONTENT_TYPE.APPLICATION_PDF, sign: [0x25, 0x50, 0x44, 0x46] }
			];

			const foundResult: Signature | undefined = SignatureMap.find((one: Signature): boolean => {
				return one.sign instanceof RegExp
					? one.sign.test(asStr)
					: Buffer.from(one.sign).equals(asBuffer.subarray(0, one.sign.length));
			});

			contentType = foundResult?.type;
		}
		else if (typeof data === 'object') {
			try {
				JSON.stringify(data);
				contentType = CONTENT_TYPE.APPLICATION_JSON;
			}
			catch (e: unknown) {
				// do nothing
			}
		}

		if (contentType === undefined) {
			if (fileName !== undefined) {
				const [, extension] = fileName.split('.');

				const extensionMap: Record<string, CONTENT_TYPE> = {
					ico: CONTENT_TYPE.IMAGE_ICO,
					gif: CONTENT_TYPE.IMAGE_GIF,
					jpg: CONTENT_TYPE.IMAGE_JPEG,
					jpeg: CONTENT_TYPE.IMAGE_JPEG,
					png: CONTENT_TYPE.IMAGE_PNG,
					tiff: CONTENT_TYPE.IMAGE_TIFF,
					webp: CONTENT_TYPE.IMAGE_WEBP,
					heic: CONTENT_TYPE.IMAGE_HEIC,

					pdf: CONTENT_TYPE.APPLICATION_PDF,
					css: CONTENT_TYPE.TEXT_CSS,
					htm: CONTENT_TYPE.TEXT_HTML,
					html: CONTENT_TYPE.TEXT_HTML,
					js: CONTENT_TYPE.APPLICATION_JAVASCRIPT,
					json: CONTENT_TYPE.APPLICATION_JSON,
					txt: CONTENT_TYPE.TEXT_PLAIN,
					text: CONTENT_TYPE.TEXT_PLAIN,
					xls: CONTENT_TYPE.APPLICATION_XLS,
					xlsx: CONTENT_TYPE.APPLICATION_XLSX
				};

				contentType = extensionMap[extension];
			}
			else if (typeof data === 'string') {
				contentType = CONTENT_TYPE.TEXT_PLAIN;
			}
		}
	}

	// fallback
	return contentType ?? CONTENT_TYPE.TEXT_PLAIN;
};


export function sift<T> (arr: T[]): T[] {
	return arr.reduce((acc: T[], one: T): T[] => {
		if (!acc.includes(one)) {
			acc.push(one);
		}

		return acc;
	}, []);
}

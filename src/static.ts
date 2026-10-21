import * as fs from 'node:fs';
import { Stats } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import * as node_path from 'node:path';

import { StaticCache, StaticOption, StaticRule } from './interfaces.js';
import { CONTENT_TYPE, DEFAULT_STATIC_CACHE_CONTROL, HEADER_KEY } from './constants.js';
import { createEtag, getContentType, isFolder, isNotModified, toContentTypeHeader } from './util.js';


export const checkStaticOption = (option: unknown): void => {
	if (option === undefined) {
		return;
	}

	if (typeof option !== 'object' || option === null || Array.isArray(option)) {
		throw new Error('static option should be an object');
	}

	const unknownKeys: string[] = Object.keys(option).filter((key: string): boolean => key !== 'cacheControl');

	if (unknownKeys.length > 0) {
		throw new Error(`unknown static option : ${ unknownKeys.join(', ') }`);
	}

	const { cacheControl } = option as StaticOption;

	if (
		cacheControl !== undefined
		&& cacheControl !== false
		&& (typeof cacheControl !== 'string' || cacheControl.trim() === '' || /[\r\n]/.test(cacheControl))
	) {
		throw new Error(`invalid cacheControl : ${ String(cacheControl) }`);
	}
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
			const { fileData, fileStat } = await loadFile(fullPath);
			const mimeType: CONTENT_TYPE = getContentType(fileData, folderOrFileName);

			cacheSet = [{
				uri: uriSanitized,
				mime: mimeType,
				fileData: fileData,
				etag: createEtag(fileData),
				lastModified: fileStat.mtime.toUTCString()
			}];
		}

		return cacheSet;
	}));

	allFileData.forEach((oneFileData) => {
		cache.push(...oneFileData);
	});

	return cache;
};

// read the content and the metadata through the same file handle,
// so that they are from the same file even if the path is replaced (e.g. by rename) in the meantime
// it doesn't guarantee atomicity for the file modified while reading
const loadFile = async (path: string): Promise<{ fileData: Buffer, fileStat: Stats }> => {
	let fileHandle: fs.promises.FileHandle | undefined;

	try {
		fileHandle = await fs.promises.open(path, 'r');

		const fileStat: Stats = await fileHandle.stat();
		const fileData: Buffer = await fileHandle.readFile();

		return { fileData, fileStat };
	}
	catch (err: unknown) {
		throw new Error(`loadFile() failed : ${ path }`, { cause: err });
	}
	finally {
		await fileHandle?.close();
	}
};

// load files of a static rule, with Cache-Control of the rule option
export const loadStaticRule = async (staticRule: StaticRule): Promise<StaticCache[]> => {
	const cacheSet: StaticCache[] = await loadFolder(staticRule.uri, staticRule.path);

	const cacheControlOption: string | false | undefined = staticRule.option?.cacheControl;
	const cacheControl: string | undefined = cacheControlOption === undefined
		? DEFAULT_STATIC_CACHE_CONTROL
		: (cacheControlOption || undefined);

	cacheSet.forEach((oneCache: StaticCache): void => {
		oneCache.cacheControl = cacheControl;
	});

	return cacheSet;
};

// send cached static file, 304 Not Modified if the client has the same file
export const sendStaticFile = (req: IncomingMessage, res: ServerResponse, cache: StaticCache): void => {
	// validators and Cache-Control are sent with 304 too (RFC 9110 15.4.5)
	res.setHeader(HEADER_KEY.ETAG, cache.etag);
	res.setHeader(HEADER_KEY.LAST_MODIFIED, cache.lastModified);

	if (cache.cacheControl !== undefined) {
		res.setHeader(HEADER_KEY.CACHE_CONTROL, cache.cacheControl);
	}

	if (isNotModified(req, cache.etag, cache.lastModified)) {
		res.statusCode = 304;
		res.end();
		return;
	}

	res.setHeader(HEADER_KEY.CONTENT_TYPE, toContentTypeHeader(cache.mime));
	// explicit content-length for HEAD, same as GET
	res.setHeader(HEADER_KEY.CONTENT_LENGTH, cache.fileData.byteLength);
	res.end(cache.fileData);
};

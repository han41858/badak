// case sensitive
export enum METHOD {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	PATCH = 'PATCH',
	DELETE = 'DELETE'
}

// default max request body size in bytes : 100KB
export const DEFAULT_BODY_LIMIT: number = 100 * 1024;

// case in-sensitive
export enum HEADER_KEY {
	CONTENT_TYPE = 'content-type',
	CONTENT_LENGTH = 'content-length'
}


export enum CONTENT_TYPE {
	TEXT_PLAIN = 'text/plain',
	TEXT_HTML = 'text/html',
	TEXT_CSS = 'text/css',
	// TEXT_JAVASCRIPT = 'text/javascript', // deprecated with 'application/javascript'

	IMAGE_ICO = 'image/x-icon',
	IMAGE_GIF = 'image/gif',
	IMAGE_JPEG = 'image/jpeg',
	IMAGE_BMP = 'image/bmp',
	IMAGE_PNG = 'image/png',
	IMAGE_TIFF = 'image/tiff',
	IMAGE_WEBP = 'image/webp',
	IMAGE_HEIC = 'image/heic',
	IMAGE_SVG = 'image/svg+xml',
	IMAGE_AVIF = 'image/avif',

	FONT_WOFF = 'font/woff',
	FONT_WOFF2 = 'font/woff2',
	FONT_TTF = 'font/ttf',
	FONT_OTF = 'font/otf',

	AUDIO_MPEG = 'audio/mpeg',
	VIDEO_MP4 = 'video/mp4',
	VIDEO_WEBM = 'video/webm',

	TEXT_CSV = 'text/csv',
	TEXT_MARKDOWN = 'text/markdown',

	APPLICATION_JSON = 'application/json',
	APPLICATION_JAVASCRIPT = 'application/javascript',
	APPLICATION_OCTET_STREAM = 'application/octet-stream',
	APPLICATION_PDF = 'application/pdf',
	APPLICATION_WWW_FORM_URLENCODED = 'application/x-www-form-urlencoded',
	APPLICATION_WASM = 'application/wasm',
	APPLICATION_XML = 'application/xml',
	APPLICATION_MANIFEST_JSON = 'application/manifest+json',

	APPLICATION_XLS = 'application/vnd.ms-excel',
	APPLICATION_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

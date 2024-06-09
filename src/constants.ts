// case sensitive
export enum METHOD {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	DELETE = 'DELETE'
}

// case in-sensitive
export enum HEADER_KEY {
	CONTENT_TYPE = 'content-type'
}


export enum CONTENT_TYPE {
	TEXT_PLAIN = 'text/plain',
	TEXT_HTML = 'text/html',
	TEXT_CSS = 'text/css',
	// TEXT_JAVASCRIPT = 'text/javascript', // deprecated with 'application/javascript'

	IMAGE_GIF = 'image/gif',
	IMAGE_PNG = 'image/png',
	IMAGE_JPEG = 'image/jpeg',
	IMAGE_BMP = 'image/bmp',
	IMAGE_TIFF = 'image/tiff',
	IMAGE_WEBP = 'image/webp',

	APPLICATION_JSON = 'application/json',
	APPLICATION_JAVASCRIPT = 'application/javascript',
	APPLICATION_OCTET_STREAM = 'application/octet-stream',
	APPLICATION_PDF = 'application/pdf',
	APPLICATION_WWW_FORM_URLENCODED = 'application/x-www-form-urlencoded'
}

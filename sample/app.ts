// example app : a small user API with authentication, file upload & download, and a SPA
// run : npx tsx sample/index.ts
// spec/sample.spec.ts runs these routes, so this file stays working with the current API
import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import * as path from 'node:path';

// in your project : import { ... } from 'badak';
import { Badak, HttpError, ParamContext } from '../src/index';


export interface User {
	id: string;
	name: string;
}

interface IdParams {
	id: string;
}

interface ListQuery {
	name?: string | string[];
}

// the generic type of a route is not validated at runtime, check untrusted input like this
const isNewUser = (body: unknown): body is Pick<User, 'name'> => {
	return typeof body === 'object'
		&& body !== null
		&& typeof (body as { name?: unknown }).name === 'string'
		&& (body as { name: string }).name.trim() !== '';
};

// CSV field (RFC 4180) : quote if it has a comma, a quote or a line break, and double the quotes
// a value starting with '=', '+', '-', '@', tab or CR is a formula in spreadsheet programs,
// so it is prefixed with ' to be shown as text (CSV injection)
// this is a mitigation, not a guarantee : spreadsheet programs and their import settings interpret CSV differently,
// and the prefixed value is not the original value (e.g. '-2' for -2)
export const toCsvField = (value: string): string => {
	const text: string = /^[=+\-@\t\r]/.test(value)
		? `'${ value }`
		: value;

	return /[",\r\n]/.test(text)
		? `"${ text.replace(/"/g, '""') }"`
		: text;
};

const toCsvLine = (fields: string[]): string => fields.map(toCsvField).join(',') + '\r\n';

export interface SampleAppOption {
	token: string; // Bearer token for the API
	log?: (line: string) => void;
}

export const createApp = async ({ token, log }: SampleAppOption): Promise<Badak> => {
	const app: Badak = new Badak({
		catchErrorLog: false
	});

	const users: Map<string, User> = new Map();
	let lastId: number = 0;

	// 1. authentication : runs before the request body is received
	// routes with { auth: false }, static files and the SPA are public
	await app.auth((req: IncomingMessage): void => {
		if (req.headers.authorization !== `Bearer ${ token }`) {
			throw new HttpError(401, { headers: { 'WWW-Authenticate': 'Bearer' } });
		}
	});

	// 2. access log, after the response
	if (log !== undefined) {
		await app.after((req: IncomingMessage, res: ServerResponse): void => {
			// res.writableEnded is false if the client closed the connection while sending the request body
			log(`${ req.method } ${ req.url } ${ res.writableEnded ? res.statusCode : 'closed' }`);
		});
	}

	// 3. public route
	await app.get('/api/health', (): { status: string } => ({ status: 'ok' }), { auth: false });

	// 4. CRUD with typed params, query and validated body
	await app.get<{ query: ListQuery }>('/api/users', ({ query }): User[] => {
		// repeated keys are an array, e.g. ?name=a&name=b
		const names: string[] | undefined = query.name === undefined
			? undefined
			: ([] as string[]).concat(query.name);

		return [...users.values()]
			.filter((user: User): boolean => names === undefined || names.includes(user.name));
	});

	await app.get<{ params: IdParams }>('/api/users/:id', ({ params }): User => {
		const user: User | undefined = users.get(params.id);

		if (user === undefined) {
			throw new HttpError(404, { body: { message: `user ${ params.id } not found` } });
		}

		return user;
	});

	await app.post('/api/users', ({ body }: ParamContext, req: IncomingMessage, res: ServerResponse): User => {
		if (!isNewUser(body)) {
			throw new HttpError(400, { body: { message: 'name is required' } });
		}

		const user: User = { id: String(++lastId), name: body.name.trim() };
		users.set(user.id, user);

		res.statusCode = 201;
		res.setHeader('Location', `/api/users/${ user.id }`);

		return user;
	});

	await app.delete<{ params: IdParams }>('/api/users/:id', ({ params }, req: IncomingMessage, res: ServerResponse): void => {
		if (!users.delete(params.id)) {
			throw new HttpError(404);
		}

		res.statusCode = 204;
	});

	// 5. file upload (multipart/form-data) with a larger body limit for this route only
	// a file part is a Buffer, or a string for text/plain
	await app.post('/api/files', ({ body }: ParamContext): { name: string, size: number } => {
		const file: unknown = (body as { file?: unknown } | undefined)?.file;

		if (!Buffer.isBuffer(file) && typeof file !== 'string') {
			throw new HttpError(400, { body: { message: 'file is required' } });
		}

		const name: unknown = (body as { name?: unknown }).name;

		return {
			name: typeof name === 'string' ? name : 'unnamed',
			size: Buffer.byteLength(file)
		};
	}, { bodyLimit: 10 * 1024 * 1024 });

	// 6. download as a stream
	await app.get('/api/users.csv', (ctx: ParamContext, req: IncomingMessage, res: ServerResponse): Readable => {
		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');

		return Readable.from([
			toCsvLine(['id', 'name']),
			...[...users.values()].map((user: User): string => toCsvLine([user.id, user.name]))
		]);
	});

	// 7. SPA : static files and index.html for other paths
	// API routes are matched first, '/**' of the SPA is a fallback
	await app.setSPARoot('/', path.join(__dirname, 'public'));

	return app;
};

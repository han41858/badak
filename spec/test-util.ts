import { expect } from 'chai';

export const fail = (error?: unknown): void => {
	if (error) { // error can be undefined
		console.error(error);
	}

	throw new Error('this case should be not execute');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isThenable = (input: any): input is Promise<any> => {
	return input && typeof input.then === 'function';
};

export function emptyFnc (): void {
	// empty function
}

export async function emptyAsyncFnc (): Promise<void> {
	// empty function
}

export function echoFnc<T> (param: T): T {
	return param;
}


export const promiseFail = async (promiseResult: Promise<unknown>): Promise<void> => {
	if (promiseResult
		&& isThenable(promiseResult)) {
		promiseResult.then(fail, (err: Error): void => {
			expect(err).to.be.instanceof(Error);
		});
	}
	else {
		fail();
	}
};

export const TestPort = 65030;

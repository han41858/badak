import { expect } from 'chai';

export const fail = (error?: unknown): never => {
	if (error) { // error can be undefined
		console.error(error);
	}

	throw new Error('this case should be not execute');
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
	return promiseResult.then(fail, (err: Error): void => {
		expect(err).to.be.instanceof(Error);
	});
};

export const TestPort = 65030;

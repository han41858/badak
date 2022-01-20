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

export const promiseFail = async (promiseResult: unknown | Promise<unknown>): Promise<void> => {
	if (promiseResult
		&& isThenable(promiseResult)) {
		promiseResult.then(fail, (err: Error) => {
			expect(err).to.be.instanceof(Error);
		});
	}
	else {
		fail();
	}
};

export const TestPort = 65030;
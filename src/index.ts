export type QueryStep = { method: string; args: any[] }

export type QueryPlan<T> = {
	// This is a reserved name so that we can get we can create the QueryBuilders using
	// a proxy rather generating them using some kind of macro.
	$steps: QueryStep[]
	// This is not a real value but we put this here so that you can use `typeof plan.$type`
	// to have a typed response when evaluating this query plan.
	$type: T
}

export type AnyFunction = (...args: any[]) => any

export type AnyFunctionMap = { [key: string]: AnyFunction }

export type QueryBuilder<T extends AnyFunctionMap> = {
	[K in keyof T]: (
		...args: Parameters<T[K]>
	) => ReturnType<T[K]> extends AnyFunctionMap
		? QueryBuilder<ReturnType<T[K]>>
		: QueryPlan<ReturnType<T[K]>>
}

export function queryBuilder<T extends AnyFunctionMap>(
	steps: QueryStep[] = []
): QueryBuilder<T> {
	return new Proxy(
		{},
		{
			get(target, prop: any) {
				if (prop === "$steps") {
					return steps
				} else {
					return (...args: any[]) => {
						const step: QueryStep = { method: prop as string, args }
						return queryBuilder([...steps, step])
					}
				}
			},
		}
	) as any
}

export function evaluateQueryPlan<T>(
	evaluate: (steps: QueryStep[]) => Promise<any>,
	plan: QueryPlan<T>
): Promise<T> {
	return evaluate(plan.$steps)
}

export function evaluateQuerySteps(evaluator: any, steps: QueryStep[]) {
	let result: any = evaluator
	for (const step of steps) {
		result = result[step.method](...step.args)
	}
	return result
}

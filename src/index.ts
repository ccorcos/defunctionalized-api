// Using a strategy similar to the Selenium Framework:
// https://gist.github.com/ccorcos/5372e1f946927d5043f070fb9260fcea

// ============================================================================
// Remote API
// ============================================================================

// Types that define the procedures in the remote process.
// This example demonstrates something that feels a lot like an ORM.
type RootQuery = {
	getPerson(id: string): PersonQuery
	getPeopleNamed(name: string): PeopleQuery
}

type PersonQuery = {
	getName(): string
	getAge(): number
	isOlderThan(age: number): boolean
}

type PeopleQuery = {
	mapGetName(): string[]
	mapGetAge(): number[]
	mapIsOlderThan(age: number): boolean[]
	filterIsOlderThan(age: number): PeopleQuery
	atIndex(index: number): PersonQuery
}

// ============================================================================
// Query Builder
// ============================================================================

type QueryStep = { method: string; args: any[] }

type QueryPlan<T> = {
	// This is a reserved name so that we can get we can create the QueryBuilders using
	// a proxy rather generating them using some kind of macro.
	$steps: QueryStep[]
	// This is not a real value but we put this here so that you can use `typeof plan.$type`
	// to have a typed response when evaluating this query plan.
	$type: T
}

type AnyFunction = (...args: any[]) => any

type AnyFunctionMap = { [key: string]: AnyFunction }

type QueryBuilder<T extends AnyFunctionMap> = {
	[K in keyof T]: (
		...args: Parameters<T[K]>
	) => ReturnType<T[K]> extends AnyFunctionMap
		? QueryBuilder<ReturnType<T[K]>>
		: QueryPlan<ReturnType<T[K]>>
}

function queryBuilder<T extends AnyFunctionMap>(
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

function evaluateQueryPlan<T>(
	evaluate: (steps: QueryStep[]) => Promise<any>,
	plan: QueryPlan<T>
): Promise<T> {
	return evaluate(plan.$steps)
}

// ============================================================================
// Remote Process Evaluators
// ============================================================================

// Remote state.
type Person = { id: string; name: string; age: number }
const people: Person[] = [
	{ id: "1", name: "joe", age: 10 },
	{ id: "2", name: "joe", age: 11 },
	{ id: "3", name: "bob", age: 12 },
	{ id: "4", name: "jeff", age: 15 },
]

class RootQueryEvaluator implements RootQuery {
	getPerson(id: string): PersonQuery {
		const person = people.find((person) => person.id === id)
		if (!person) throw new Error("Could not find person: " + id)
		return new PersonQueryEvaluator(person)
	}
	getPeopleNamed(name: string): PeopleQuery {
		const persons = people.filter((person) => person.name === name)
		return new PeopleQueryEvaluator(persons)
	}
}

class PersonQueryEvaluator implements PersonQuery {
	constructor(public person: Person) {}
	getName(): string {
		return this.person.name
	}
	getAge(): number {
		return this.person.age
	}
	isOlderThan(age: number): boolean {
		return this.person.age > age
	}
}

class PeopleQueryEvaluator implements PeopleQuery {
	constructor(public persons: Person[]) {}

	mapGetName() {
		return this.persons.map((person) => person.name)
	}
	mapGetAge() {
		return this.persons.map((person) => person.age)
	}
	mapIsOlderThan(age: number) {
		return this.persons.map((person) => person.age > age)
	}
	filterIsOlderThan(age: number): PeopleQuery {
		return new PeopleQueryEvaluator(
			this.persons.filter((person) => person.age > age)
		)
	}
	atIndex(index: number): PersonQuery {
		const person = this.persons[index]
		if (!person) throw new Error("No person at index: " + index)
		return new PersonQueryEvaluator(person)
	}
}

// (value: any) => Promise<void>
function evaluateQuerySteps(evaluator: any, steps: QueryStep[]) {
	let result: any = evaluator
	for (const step of steps) {
		result = result[step.method](...step.args)
	}
	return result
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
	const q = queryBuilder<RootQuery>()

	const evaluate = async (steps: QueryStep[]) => {
		// Main process
		const serializedSteps = JSON.stringify(steps)

		// Remote process
		const deserializedSetps = JSON.parse(serializedSteps)
		const result = evaluateQuerySteps(
			new RootQueryEvaluator(),
			deserializedSetps
		)
		const serializedResult = JSON.stringify(result)

		// Main process
		const deserializedResult = JSON.parse(serializedResult)
		return deserializedResult
	}

	type Assert<A, B extends A> = {}

	example: {
		const plan = q.getPerson("1").getName()
		const name = await evaluateQueryPlan(evaluate, plan)
		type X = Assert<typeof name, string>
		assert.equal(name, "joe")
	}

	example: {
		const plan = q.getPeopleNamed("joe").mapGetAge()
		const ages = await evaluateQueryPlan(evaluate, plan)
		type X = Assert<typeof ages, number[]>
		assert.deepEqual(ages, [10, 11])
	}

	example: {
		const plan = q.getPeopleNamed("joe").mapGetAge()
		const ages = await evaluateQueryPlan(evaluate, plan)
		type X = Assert<typeof ages, number[]>
		assert.deepEqual(ages, [10, 11])
	}

	example: {
		const plan = q
			.getPeopleNamed("joe")
			.filterIsOlderThan(10)
			.atIndex(0)
			.getAge()
		const age = await evaluateQueryPlan(evaluate, plan)
		type X = Assert<typeof age, number>
		assert.deepEqual(age, 11)
	}
}

main()
	.then(() => {
		console.log("done")
		process.exit(0)
	})
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})

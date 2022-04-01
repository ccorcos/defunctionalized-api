import test from "ava"
import {
	evaluateQueryPlan,
	evaluateQuerySteps,
	queryBuilder,
	QueryStep,
} from "../src"

// ============================================================================
// API Types
// ============================================================================

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
// Remote Process
// ============================================================================

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

const q = queryBuilder<RootQuery>()

// Simulating an async call into the remote process
const evaluate = async (steps: QueryStep[]) => {
	// Main process
	const serializedSteps = JSON.stringify(steps)

	// Remote process
	const deserializedSetps = JSON.parse(serializedSteps)
	const result = evaluateQuerySteps(new RootQueryEvaluator(), deserializedSetps)
	const serializedResult = JSON.stringify(result)

	// Main process
	const deserializedResult = JSON.parse(serializedResult)
	return deserializedResult
}

type Assert<A, B extends A> = {}

test("getPerson.getName", async (t) => {
	const plan = q.getPerson("1").getName()
	const name = await evaluateQueryPlan(evaluate, plan)
	type X = Assert<typeof name, string>
	t.deepEqual(name, "joe")
})

test("getPeopleNamed.mapGetAge", async (t) => {
	const plan = q.getPeopleNamed("joe").mapGetAge()
	const ages = await evaluateQueryPlan(evaluate, plan)
	type X = Assert<typeof ages, number[]>
	t.deepEqual(ages, [10, 11])
})

test("getPeopleNamed.filterIsOlderThan.atIndex.getAge", async (t) => {
	const plan = q.getPeopleNamed("joe").filterIsOlderThan(10).atIndex(0).getAge()
	const age = await evaluateQueryPlan(evaluate, plan)
	type X = Assert<typeof age, number>
	t.deepEqual(age, 11)
})

# Defunctionalized API

This library helps you to define a composable [defunctionalized](https://blog.sigplan.org/2019/12/30/defunctionalization-everybody-does-it-nobody-talks-about-it/) fluent API for constructing a serializable query that can get evaluated in a remote process.

## Getting Started

```sh
npm install --save defunctionalized-api
```

## Background

I built a testing framework where I had a bunch of API methods that called into the renderer process. Things like:

```ts
getElementRect(cssSelector: string): Rect
getElementText(cssSelector: string): string
getRectsOfElementsThatContainText(cssSelector: string, text: string): Rect[]
```

As you can see, this API does not compose well. So, we ended up writing more and more functions that simply combined a small set of primitive functions.

Thus, the goal is to be able to reduce `getRectsOfElementsThatContainText` into `getElements(cssSelector).filterTextContains(text).mapGetRects()`.

(One improvement for this API is to seemlessly handle arrays so we can map and filter more generally.)

To do this, we start by defining a fluent API:

```ts
type RootQuery = {
	getElement(cssSelector: string): ElementQuery
	getElements(cssSelector: string): ElementsQuery
}

type ElementQuery = {
	getRect(): Rect
	getText(): string
}

type ElementsQuery = {
	filterTextContains(text: string): ElementsQuery
	mapGetRect(): Rect[]
	atIndex(index: number): ElementQuery
}
```

At this point, you can construct query plans from your testing process:

```ts
const q = queryBuilder<RootQuery>()
const plan = q.getElements("button").filterTextContains("submit").atIndex(0).mapGetRects()
```

Now we just need to build some evaluators in the renderer process to evaluate this plan:

```ts

class RootQueryEvaluator implements RootQuery {
	getElement(cssSelector: string) {
		const element = document.querySelector(cssSelector)
		if (!element) throw new Error("Could not find element: " + cssSelector)
		return new ElementQueryEvaluator(element)
	}
	getElements(cssSelector: string) {
		const elements = document.querySelectorAll(cssSelector)
		if (elements.length === 0) throw new Error("Could not find elements: " + cssSelector)
		return new ElementsQueryEvaluator(elements)
	}
}

class ElementQueryEvaluator implements ElementQuery {
	constructor(public element: HTMLElement) {}
	getRect() {
		return this.element.getClientBoundingRect()
	}
	getText() {
		return this.element.innerText
	}
}

class ElementsQueryEvaluator implements ElementsQuery {
	constructor(public elements: HTMLElement[]) {}
	filterTextContains(text: string) {
		return new ElementsQueryEvaluator(
			this.elements.filter(element => element.innerText.includes(text))
		)
	}
	mapGetRect() {
		return this.elements.map(element => element.getClientBoundingRect())
	}
	atIndex(index: number) {
		const element = this.elements[index]
		if (!element) throw new Error("Index out of range: " + index)
		return new ElementQuery(element)

	}
}
```

Now, given a set of steps from a QueryPlan, we can evaluate the result:

```ts
const result = evaluateQuerySteps(new RootQueryEvaluator(), plan.$steps)
```

And now all we need to do is wire this up to a remote procedure call we're good to go!


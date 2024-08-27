function createIterator(i) {
    let a = 0
    return {
        next: function () {
            var done = a >= i.length
            var value = done ? undefined : i[a++]
            return {
                done: done,
                value: value,
            }
        },
    }
}

const iterator = createIterator([1, 2, 3, 4, 5])
console.log(iterator.next())
console.log(iterator.next())
console.log(iterator.next())
console.log(iterator.next())
console.log(iterator.next())
console.log(iterator.next())
console.log(iterator.next())

console.log('--------------------------------------1')

function* createIteratortwo() {
    yield 1
    yield 2
    yield 3
}

const twoIterator = createIteratortwo()
console.log(twoIterator.next())
console.log(twoIterator.next())
console.log(twoIterator.next())
console.log(twoIterator.next())

console.log('--------------------------------------2')

function* test() {
    let a = 0
    while (a < 3) {
        yield a++
    }
}

const testconst = test()
console.log(testconst.next())
console.log(testconst.next())
console.log(testconst.next())
console.log(testconst.next())
console.log(testconst.next())

console.log('--------------------------------------3')

function run(testref) {
    let tesk = testref()
    let result = tesk.next()
    function step() {
        if (!result.done) {
            result = tesk.next()
            step()
        }
    }
    step()
}

run(function* () {
    console.log(1)
    yield
    console.log(2)
    yield
    console.log(3)
    yield
})

console.log('--------------------------------------4')

function runs(testRef) {
    let tesk = testRef()
    let result = tesk.next()
    function step() {
        if (!result.done) {
            result = tesk.next()
            step()
        }
    }
    step()
}

runs(function* () {
    let value = yield 1
    console.log(value)
    value = yield value + 3
    console.log(value)
})

console.log('--------------------------------------5')

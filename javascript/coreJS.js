{
  const dely = (time) =>
    new Promise((reslove) => setTimeout(() => reslove, time))

  async function sleepRandom(time) {
    await dely(time * 1e3)
    return 0 | (Math.random() * 1e3)
  }

  async function sleepError(time, msg) {
    await dely(time * 1e3)
    throw Error(msg)
  }

  ;(async () => {
    try {
      console.log('Run') // => Run
      console.log(await sleepRandom(1)) // => 936, after 5 sec.
      let [a, b, c] = await Promise.all([
        sleepRandom(5),
        sleepRandom(15),
        sleepRandom(10),
      ])
      console.log(a, b, c) // => 210 445 71, after 15 sec.
      await sleepError(5, 'Error!')
      console.log('Will not be displayed')
    } catch (e) {
      console.log(e) // => Error: 'Error!', after 5 sec.
    }
  })()
}
{
  let Person = (() => {
    let NAME = Symbol('name')
    return class {
      constructor(name) {
        this[NAME] = name
      }
      getName() {
        return this[NAME]
      }
    }
  })()
  let persons = new Person('Vasye')
  console.log(persons.getName()) // => Vasye
  console.log(persons['name']) // => undefined
  console.log(persons[Symbol['name']]) // => underfined
  //   for (let key of persons) console.log(key)
}

{
  let array = [1]
  let map = new Map([
    ['a', 1],
    [42, 2],
  ])
  map.set(array, 4).set(true, 3)
  console.log(map)
  console.log('map size:', map.size)
  console.log('map get:', map.get(array))
  console.log('map has:', map.has(array))
  console.log('map has:', map.has(1))
  map.forEach((val, index) => {
    console.log('val: ', val, 'index: ', index)
  })
  map.delete(array)
  console.log(map)
  console.log('map size:', map.size)
  console.log('map get:', map.get(array))
  console.log(Array.from(map))
}

{
  Promise.all([Promise.resolve(1), Promise.reject(2), Promise.resolve(3)])
    .then(({ res }) => console.log(res))
    .catch(({ error }) => console.error(error))
}

{
  let arr = [1, 2, 3, 4, 5, 6, 7]
  console.log('values: ', arr.values())
  let newArr = [1, 2, 3, 4, 5, 6, 7]
    .values()
    .drop(1)
    .take(5)
    .filter((it) => it % 2)
    .map((it) => it ** 2)
    .toArray()
  console.log(newArr)
}

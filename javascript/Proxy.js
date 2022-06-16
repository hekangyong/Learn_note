{
  const handle = {
    get: (obj, prop) => {
      console.error(obj, prop)
      return prop in obj ? obj[prop] : '45'
    },
    set: (obj, prop, val) => {
      if (prop === 'age') {
        obj[prop] = val >= 30 ? val : 30
      }
      return true
    },
  }

  const handleA = {
    age: 123,
  }

  const p = new Proxy(handleA, handle)

  p.age = 1
  console.log(p.a)
  console.log('c' in p, p.c)
  console.log(p.age)
  console.log(p)
}

{
  
}

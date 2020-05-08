const fun = (number = 10) => {
  return {
    all: () => {
      return number > 10 ? true : false
    },
  }
}

console.log(fun().all())

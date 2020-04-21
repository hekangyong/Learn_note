function Hey(name) {
  const a = name.replace(' ', '')
  this.name = a
}

Hey.prototype.hello = function () {
  console.log(this.name)
}

const a = new Hey(' hey ')
console.log(a)

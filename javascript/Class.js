class TestB {
  constructor(name) {
    this.userName = name
  }
  get() {
    if (!this.userName) {
      return (this.userName = 'hhh')
    } else {
      return this.userName
    }
  }
  set(name) {
    if (name === '') {
      throw new Error('this is a error')
    }
    this.userName = name
  }
}
const a = new TestB()
console.log(a.userName)
console.log((a.userName = 'asd'))
console.log((a.userName = ''))

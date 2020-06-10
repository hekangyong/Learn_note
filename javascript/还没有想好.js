const fun = (number = 10) => {
  return {
    all: () => {
      return number > 10 ? true : false
    },
  }
}

console.log(fun().all())

class HappyEvent {
  constructor(name, steps) {
    this.name = name
    this.steps = steps
  }

  async do(peoples) {
    const { steps } = this
    const { length } = peoples
    const peoplesStr = `${peoples.slice(0, length - 1).join('、')}和${
      peoples[length - 1]
    }`
    HappyEvent.log(`${peoplesStr}准备去${this.name}`)

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      HappyEvent.log(`${peoplesStr}在${step.name}...`)
      await new Promise((reject) => {
        setTimeout(() => {
          reject()
        }, step.time * 1000)
      })
    }
  }

  static log(info) {
    const date = new Date()
    console.log(`${date.getSeconds()}分 ${info}`)
  }
}

class Happy {
  constructor(man, girls) {
    Object.assign(this, { man, girls })
  }

  async play(events) {
    const { man, girls } = this
    for (let i = 0; i < girls.length; i++) {
      const girl = girls[i]
      const event = events[Math.floor(Math.random() * events.length)]
      console.log(event)
      await event.do([man, girl])
    }

    HappyEvent.log('旅行结束！')
  }
}

new Happy('Jace', ['糖糖', '小菜鸟', '椰子鸡']).play([
  new HappyEvent('吃饭', [
    {
      name: '找饭店',
      time: 1,
    },
    {
      name: '吃饭',
      time: 5,
    },
  ]),
  new HappyEvent('看电影', [
    {
      name: '找电影院',
      time: 3,
    },
    {
      name: '买电影票',
      time: 1,
    },
    {
      name: '看电影',
      time: 8,
    },
  ]),
  new HappyEvent('啪啪啪', [
    {
      name: '找酒店',
      time: 1,
    },
    {
      name: '开房',
      time: 1,
    },
    {
      name: '啪啪啪',
      time: 10,
    },
  ]),
])

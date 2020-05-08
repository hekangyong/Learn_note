const rxjs = require('rxjs')

// const observavble = new rxjs.Observable((subscribe) => {
//   subscribe.next(1)
//   subscribe.next(2)
//   subscribe.next(3)
//   setTimeout(() => {
//     subscribe.next(4), subscribe.complete()
//   }, 1000)
// })

// console.log('start')
// observavble.subscribe({
//   next(res) {
//     console.log(`res: ${res}`)
//   },
//   error(err) {
//     console.log(`err: ${err}`)
//   },
//   complete() {
//     console.log('complete')
//   },
// })
// console.log('end')

const btn = document.getElementById('btn1')

const handle = (e) => {
  console.log(e)
}
btn.addEventListener('click', handle)

// rxjs.Observable.fromEvent(document.body, 'click') // 注册监听
//   .take(1) // 只取一次
//   .subscribe(console.log)

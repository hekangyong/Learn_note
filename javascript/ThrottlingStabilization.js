const inputa = document.getElementById('inputa')
const inputb = document.getElementById('inputb')
const inputc = document.getElementById('inputc')

function ajax(content) {
  console.log('ajax request: ' + content)
}

function antiShake(fn, dely) {
  var timer
  return (args) => {
    const that = this
    const _args = args
    if (timer) {
      clearInterval(timer)
    }
    timer = setTimeout(() => {
      fn.call(that, _args)
    }, dely)
  }
}

let antFun = antiShake(ajax, 500)

inputb.addEventListener('keyup', (e) => {
  if (e.target.value !== '') {
    antFun(e.target.value)
  }
})

inputa.addEventListener('keyup', (e) => {
  ajax(e.target.value)
})
function throttle(fun, delay) {
  let last, deferTimer
  return function (args) {
    let that = this
    let _args = arguments
    let now = +new Date()
    if (last && now < last + delay) {
      clearTimeout(deferTimer)
      deferTimer = setTimeout(function () {
        last = now
        fun.apply(that, _args)
      }, delay)
    } else {
      last = now
      fun.apply(that, _args)
    }
  }
}

let throttleAjax = throttle(ajax, 1000)

inputc.addEventListener('keyup', function (e) {
  throttleAjax(e.target.value)
})


// 出自：https://juejin.im/post/5b8de829f265da43623c4261
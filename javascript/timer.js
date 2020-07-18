const stopBtn = document.querySelector('#stop')
let timer
function start() {
  timer = setInterval(() => {
    console.log('asd')
  }, 100)
}
start()
function stop() {
  console.log('click')
  clearInterval(timer)
}

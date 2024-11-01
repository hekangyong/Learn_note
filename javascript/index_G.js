var items = [1, 2, 3, 4, 5, 6]
var results = []
var running = 0
var limit = 3
function async(arg, callback) {
    console.log('参数为' + arg + ',1秒返回结果')
    setTimeout(() => {
        callback(arg * 2)
    }, 1000)
}
function final(value) {
    console.log('end' + value)
}
function launcher() {
    while (running < limit && items.length > 0) {
        var item = items.shift()
        async(item, result => {
            results.push(result)
            running--
            if (items.length > 0) {
                launcher()
            } else if (running == 0) {
                final(results)
            }
        })
        running++
    }
}

launcher()

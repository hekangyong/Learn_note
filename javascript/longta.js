const arr = [
    [11, 12, 13, 14, 15, 16, '数组一'],
    ['2-哦吼掉落', 22, 23, 24, 25, '数组二'],
    ['3-哦吼掉落', 32, 33, 34, '数组三'],
    ['4-哦吼掉落', 42, 43, '数组四'],
    ['5-哦吼掉落', 52, '数组五'],
    [1, '数组六'],
]

console.log(arr)

let currentStatus = 0

function takeOnclick(type) {
    return type === 'once' ? once() : ten()
}

function once() {
    const brandom = Math.floor(Math.random() * arr[currentStatus].length)
    console.log('开始抽奖 (๑•̀ㅂ•́)و✧')
    setTimeout(() => {
        console.log('抽中了(*^▽^*): ', arr[currentStatus][brandom])
        if (brandom === arr[currentStatus].length - 1) {
            currentStatus += 1
            console.log(currentStatus)
        }
        if (brandom === 0) {
            currentStatus -= 1
            console.log(currentStatus)
        }
    }, 1000)
}

function ten() {
    console.log('开始十连抽︿(￣︶￣)︿...')
    let getGift = []
    for (let i = 0; i < 10; i++) {
        const brandom = Math.floor(Math.random() * arr[currentStatus].length)
        console.log('抽中了(*^▽^*): ', arr[currentStatus][brandom])
        getGift.push(arr[currentStatus][brandom])
        if (brandom === arr[currentStatus].length - 1) {
            currentStatus =
                currentStatus === arr.length - 1 ? 0 : currentStatus + 1
            console.log(currentStatus)
        }
        if (
            brandom === 0 &&
            currentStatus !== 0 &&
            currentStatus !== arr.length - 1
        ) {
            currentStatus -= 1
            console.log(currentStatus)
        }
    }
    console.log(getGift)
}

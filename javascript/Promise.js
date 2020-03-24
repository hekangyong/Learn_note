const promise = new Promise((reslove, reject) => {
  setTimeout(() => {
    reslove('asdasd')
  }, 200)
})

// promise.then(res => {
//   console.log(res)
// })

console.log(promise)

console.log('---------------1---------------')

const promiseAjax = (url, methed = 'get', data, anther) => {
  return {
    promise: new Promise((resvole, reject) => {
      $.ajax({
        //   ....
        url,
        type: methed,
        data,
        ...anther,
        success: res => {
          resvole(res)
        },
        error: err => {
          reject(err)
        },
      })
    }),
  }
}

console.log('---------------2---------------')

const a = string => {
  return new Promise((reslove, reject) => {
    setTimeout(() => {
      reslove(string)
    }, 20)
  })
}
let b = a('123')
  .then(res => {
    return res
  })
  .catch(err => {
    return err
  })

console.log('123', b, a)

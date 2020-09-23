{
  // includes 查找数组中是否存在 存在返回 true 否则为false， indexof中返回的是在数组中的下标 ，如果不在数组中则返回 -1
  let arr = ['react', 'vue', 'angular']
  console.log(arr.includes('react'), arr.includes('a')) // true false
  console.log(arr.indexOf('react'), arr.indexOf('vue'), arr.indexOf('a')) // 0 1 -1
}

{
  // ES18中的异步迭代器，除了 next() 方法返回一个Promise， 因此该方法可以 与 for...of 一起使用
  async function fun(params) {
    /**
     * await setTimeout(() => {
     *   // code TODO
     * }, 200)
     */
    for await (let a of params) {
      // code TODO
      doSomeThing(a)
    }
  }
}

{
  //  ES18 Object.values() 是一个类似 Object.keys() 的新函数，不过但vlaues返回的是对象中的所有值，不包括对象中继承的值
  const obj = { a: 1, b: 2, c: 3 }
  // 不使用ES8 将对象循环成数组
  const arr = Object.keys(obj).map((i) => obj[i])
  console.log(arr) // [1,2,3]
  const arrThirt = Object.keys(obj)
  console.log(arrThirt) // ['a','b','c']
  // 使用ES8 将对象循环成数组
  const arrTwo = Object.values(obj)
  console.log(arrTwo) // [1,2,3]
}

{
  // ES8 Object.entries() 函数返回一个给定自身对象一个可枚举属性的键值对的一个数组
  const obj = { a: 1, b: 2, c: 3 }
  Object.keys(obj).map((item) => {
    console.log(`key: ${item}, value: ${obj[item]}`)
  })
  console.log('----------this is a cut-off online------------')
  console.log('this is Object.entries() function: ', Object.entries(obj))
  for (let [key, value] of Object.entries(obj)) {
    console.log(`key: ${key}, value: ${value}`)
  }
}

{
  // Object.getOwnPropertyDescriptiors() 函数用来获取一个对象的自身属性的描述符，如果没有任何自身属性，则返回空对象
  const obj = {
    name: 'lihn',
    get age() {
      return '18'
    },
  }
  const result = Object.getOwnPropertyDescriptors(obj)
  console.log(result)
  /**
   *   {
   *     name: {
   *       value: 'lihn',
   *       writable: true,
   *       enumerable: true,
   *       configurable: true
   *     },
   *     age: {
   *       get: [Function: get age],
   *       set: undefined,
   *       enumerable: true,
   *       configurable: true
   *     }
   *   }
   */
}

{
  /**
   *   ShardArrayBuffer 对象用来表示一个通用的，固定长度的原始二进制数据缓冲区，
   *   类似于 ArrayBuffer 对象，它们都可以用来在共享内存（shared memory）上创建视图。
   *   与 ArrayBuffer 不同的是，SharedArrayBuffer 不能被分离。
   *   @param {*} length 所创建的数组缓冲区的大小，以字节(byte)为单位。
   *   @returns {SharedArrayBuffer} 一个大小指定的新 SharedArrayBuffer 对象。其内容被初始化为 0。
   */
  const length = 8
  console.log('this is SharedArrayBuffer: ', new SharedArrayBuffer(length))
}

{
  /**
   * Unit8Array 数组类型： 表示一个8位无符号整形的数组，创建时内容初始化为0,创建完成后，
   * 可以以对象的方式或数组下标索引的方式引用数组中的元素。
   */
  const length = 8
  const obj = [{ a: 1, b: 2, c: 3 }]
  console.log('this is Unit8Array params is length: ', new Uint8Array(length))
  console.log('this is Unit8Array params is arr', new Uint8Array(obj))
}

/**
 * Actomics 对象
 * 提供了一组静态方法用来对 ShardArrayBuffer对象进行原子操作
 * @param {typedArray, value, index} typedArray 一个共享的整形typed array, 例如 Int8Array，Uint8Array，Int16Array，Uint16Array，Int32Array，或者 Uint32Array.
 * @return {Actomics.add(typedArray,index,value)} 将指定位置上的元素与给定的值相加，并返回当前元素的值
 * @return {Actomics.and(typedArray,index,value)} 将指定位置上的数组元素与给定的值相与，并返回与操作前该元素的值
 * @return {Actomics.compareExchange(typedArray,index,value)} 如果数组中指定的值与给定的相等，则将其更新为新的值，并返回该元素原先的值
 * @return {Actomics.exchange(typedArray, index,value)} 将数组中指定的值更改为给定的值，并返回元素更新前的值
 * @return {Actomics.load(typedArray, index)} 返回数组中指定的值
 * @return {Actomics.or(typedArray, index, value)} 将指定的位置上的数组与给定的值相或，并返回操作前或的值
 * @return {Actomics.store(typedArray, index, value)} 将指定数组中的值更改为给定的值，并返回该值
 * @return {Actomics.sub(typedArray, index, value)} 将指定位置上的数组元素与给定值相减，并返回相减前的值
 * @return {Actomics.xor(typedArrat, index, value)} 将指定位置上的数组元素与给定的值相异或，并返回异或操作前该元素的值。
 */

{
  class Ani {
    constructor(action) {
      super('anim')
      this.action = action
    }
    action = null
  }
  const ani = new Ani('aaa')
  console.log(ani instanceof Anim)
  console.log(ani instanceof Ani)
}

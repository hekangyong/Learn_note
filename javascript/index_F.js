function Person() {

}
Person.prototype.name = '皱眉哥';
let person1 = new Person()
console.log(person1.name)
console.log(person1.__proto__ == Person.prototype)
// constructor 原型指向构造函数
console.log(Person == Person.prototype.constructor)

var items = [1, 2, 3, 4, 5, 6];
var results = [];
function async(arg, callback) {
    console.log('参数为' + arg + ',1秒返回结果');
    setTimeout(() => {
        callback(arg * 2)
    }, 1000);
}
function final(value) {
    console.log('end' + value);
}
function series(item) {
    if (item) {
        async(item, function (result) {
            results.push(result);
            return series(items.shift())
        })
    } else {
        return final(results[results.length - 1]);
    }
}

series(items.shift())

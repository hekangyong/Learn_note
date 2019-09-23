##  cookie、localStorage、sessionStorage的区别

### 共同点：

cookie、localSotrage、sessionStorage都是由浏览器存储在本地的数据

### 不同点：

1.  cookie是网站为了标识用户身份而存储在用户本地终端上的数据（通常经过加密），数据始终在同源的http请求中携带，即在浏览器和服务器之间来回传递；localStorage不会自动把数据发送给服务器尽在本地保存。

2.  cookie数据还有路径（path）的概念，可以限制cookie只属于某个路径下，存储大小也不同。cookie数据不能超过4k，同时http请求都会携带cookie，所以cookie只适合保存很小的数据；localStorage也有存储大小的限制，但是相对于cookie来说要大得多，可以达到5m或者更多。

3.  cookie只在设置的cookie过期时间之前有效，即使是在窗口或者浏览器的关闭，localStorage是永久保存的数据，如要删除只能手动删除，seesionStorage更像是一种临时通话机制，在页面或者浏览器关闭的时候自动删除。

4.  localStorage支持事件通知机制，可以将数据更新的通知发送给监听者，cookie原生的接口不友好，需要程序员自己进行封装。

5.  localStorage如何删除数据；localStorage对象可以长期保存在客户端中，除非认为的删除，一下提供了几种删除localStorage的方法：

    -   存储：`locaStorage.setItem(key, value)`,如果`key`存在则只更新`value`；
    -   获取：`locaStorage.getItem(key)`,如果`key`不存在，则返回`null`;
    -   删除：`locaStorage:removeItem(key)`,一旦删除, `key`对应的数据将会全部删除；
    -   全部清除：`locaStorage.clear()`如果一个一个的`remove`太麻烦的话，可以使用这条语句，执行的结果是localStorage中的所有数据全部清除

6.  localStorage存储的对象是不能跨浏览器公用的，只能在当前浏览器使用。

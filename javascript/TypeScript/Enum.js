var Test;
(function (Test) {
    Test[Test["FRIST"] = 0] = "FRIST";
    Test[Test["SECOND"] = 1] = "SECOND";
})(Test || (Test = {}));
console.log(Object.keys(Test));

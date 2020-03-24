/**
 * @param {number[]} A
 * @return {number[]}
 */
var sortArrayByParity = function (A) {
    if (A.length === 0) return []
    let evenArr = []
    let oddArr = []
    let sumArr = []
    for (const index of A) {
        if (index % 2 === 0) {
            evenArr.push(index)
        } else if (index % 2 === 1) {
            oddArr.push(index)
        }
    }
    return sumArr.concat(evenArr, oddArr)
};
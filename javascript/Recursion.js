function addition(start, max, sum) {
  if (start > max) {
    return sum
  } else {
    sum += start
    const num = start + 1
    return addition(num, max, sum)
  }
}

console.log(addition(1, 100, 0))

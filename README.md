# LeetCode

1. **_[给定一个 没有重复 数字的序列，返回其所有可能的全排列 未完成](./javascript/LeetCode/AllPermutation(unfinished).js)_**
2. **_[可以被一步捕获的棋子数](./javascript/LeetCode/AvailableCatchOfVehicles.js)_**
3. **_[有效括号的嵌套深度 未完成](./javascript/LeetCode/BacketsNestDepth(unfinished).js)_**
4. **_[棒球比赛](./javascript/LeetCode/BaseBallGame.js)_**
5. **_[把数字翻译成字符串](./javascript/LeetCode/BaShuZiFanYiChengZiFuChuanLcof.js)_**
6. **_[卡牌分组](./javascript/LeetCode/CardsAreGrouped.js)_**
7. **_[分糖果 II](./javascript/LeetCode/DistributeCandiesToPeople.js)_**
8. **_[拥有最多糖果的孩子](./javascript/LeetCode/KidsWithTheGreatestNumberOfCandies.js)_**
9. **_[电话号码的字母组合](./javascript/LeetCode/LetterCombinationsOfTelephoneNumbers.js)_**
10. **_[生命游戏](./javascript/LeetCode/LiveGame.js)_**
11. **_[按摩师](./javascript/LeetCode/Massager.js)_**
12. **_[链表的中间结点](./javascript/LeetCode/MiddleOfTheLinkedList.js)_**
13. **_[未知算法题 1](./javascript/LeetCode/oddOrEvenArr.js)_**
14. **_[机器人的运动范围 未完成](./javascript/LeetCode/RangeOfMotionOfTheRobot(unfinished).js)_**
15. **_[反转链表](./javascript/LeetCode/ReverseLinkedList.js)_**
16. **_[翻转字符串里的单词](./javascript/LeetCode/ReverseWordInAString.js)_**
17. **_[旋转矩阵](./javascript/LeetCode/RotationMatrix.js)_**
18. **_[腐烂的橘子](./javascript/LeetCode/RottingOranges.js)_**
19. **_[排序数组](./javascript/LeetCode/SortAnArray.js)_**
20. **_[合并排序的数组](./javascript/LeetCode/SortedMergeLcci.js)_**
21. **_[拼写单词](./javascript/LeetCode/SpellWord.js)_**
22. **_[字符串转换整数 (atoi)](<./javascript/LeetCode/String-convertedIntegers(ATOI).js>)_**
23. **_[圆圈中最后剩下的数字](./javascript/LeetCode/TheLastNumberLeftInTheCircle.js)_**
24. **_[无重复字符的最长子串](./javascript/LeetCode/TheOldestStringWithoutRepeatingCharacters.js)_**
25. **_[三维形体的表面积](./javascript/LeetCode/ThreeDimensionalSuperficialArea.js)_**
26. **_[重塑矩阵](./javascript/LeetCode/ReshapeTheMatrix.js)_**
27. **_[二维区域和检索 - 矩阵不可变](./javascript/LeetCode/RangeSumQuery2dImmutable.js)_**
28. **_[机器人的运动范围](./javascript/LeetCode/RangeOfMotionOfTheRobot.js)_**
29. **_[电话号码的字母组合](./javascript/LeetCode/TelephoneNumberCombination.js)_**
30. **_[最大概率路径](./javascript/LeetCode/1514_PathWithMaximumProbability.js)_**
31. **_[子岛屿数量](./javascript/LeetCode/1905_CountSubIslands.js.js)_**

### Cocos 便捷方法

```JavaScript
// 打印某个组件所在节点树的路径
function getNodePath (node) {
    let path;
    while (node && !(node instanceof cc.Scene)) {
        if (path) {
            path = node.name + '/' + path;
        }
        else {
            path = node.name;
        }
        node = node.parent;
    }
    return path;
}
```

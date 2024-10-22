# LeetCode

1. **_[给定一个 没有重复 数字的序列，返回其所有可能的全排列 未完成](./javascript/LeetCode/Script/AllPermutation(unfinished).js)_**
2. **_[可以被一步捕获的棋子数](./javascript/LeetCode/Script/AvailableCatchOfVehicles.js)_**
3. **_[有效括号的嵌套深度 未完成](./javascript/LeetCode/Script/BacketsNestDepth(unfinished).js)_**
4. **_[棒球比赛](./javascript/LeetCode/Script/BaseBallGame.js)_**
5. **_[把数字翻译成字符串](./javascript/LeetCode/Script/BaShuZiFanYiChengZiFuChuanLcof.js)_**
6. **_[卡牌分组](./javascript/LeetCode/Script/CardsAreGrouped.js)_**
7. **_[分糖果 II](./javascript/LeetCode/Script/DistributeCandiesToPeople.js)_**
8. **_[拥有最多糖果的孩子](./javascript/LeetCode/Script/KidsWithTheGreatestNumberOfCandies.js)_**
9. **_[电话号码的字母组合](./javascript/LeetCode/Script/LetterCombinationsOfTelephoneNumbers.js)_**
10. **_[生命游戏](./javascript/LeetCode/Script/LiveGame.js)_**
11. **_[按摩师](./javascript/LeetCode/Script/Massager.js)_**
12. **_[链表的中间结点](./javascript/LeetCode/Script/MiddleOfTheLinkedList.js)_**
13. **_[未知算法题 1](./javascript/LeetCode/Script/oddOrEvenArr.js)_**
14. **_[机器人的运动范围 未完成](./javascript/LeetCode/Script/RangeOfMotionOfTheRobot(unfinished).js)_**
15. **_[反转链表](./javascript/LeetCode/Script/ReverseLinkedList.js)_**
16. **_[翻转字符串里的单词](./javascript/LeetCode/Script/ReverseWordInAString.js)_**
17. **_[旋转矩阵](./javascript/LeetCode/Script/RotationMatrix.js)_**
18. **_[腐烂的橘子](./javascript/LeetCode/Script/RottingOranges.js)_**
19. **_[排序数组](./javascript/LeetCode/Script/SortAnArray.js)_**
20. **_[合并排序的数组](./javascript/LeetCode/Script/SortedMergeLcci.js)_**
21. **_[拼写单词](./javascript/LeetCode/Script/SpellWord.js)_**
22. **_[字符串转换整数 (atoi)](<./javascript/LeetCode/Script/String-convertedIntegers(ATOI).js>)_**
23. **_[圆圈中最后剩下的数字](./javascript/LeetCode/Script/TheLastNumberLeftInTheCircle.js)_**
24. **_[无重复字符的最长子串](./javascript/LeetCode/Script/TheOldestStringWithoutRepeatingCharacters.js)_**
25. **_[三维形体的表面积](./javascript/LeetCode/Script/ThreeDimensionalSuperficialArea.js)_**
26. **_[重塑矩阵](./javascript/LeetCode/Script/ReshapeTheMatrix.js)_**
27. **_[二维区域和检索 - 矩阵不可变](./javascript/LeetCode/Script/RangeSumQuery2dImmutable.js)_**
28. **_[机器人的运动范围](./javascript/LeetCode/Script/RangeOfMotionOfTheRobot.js)_**
29. **_[电话号码的字母组合](./javascript/LeetCode/Script/TelephoneNumberCombination.js)_**
30. **_[最大概率路径](./javascript/LeetCode/Script/1514_PathWithMaximumProbability.js)_**
31. **_[子岛屿数量](./javascript/LeetCode/Script/1905_CountSubIslands.js)_**
32. **_[移除同一行或同一列的最多石头](./javascript/LeetCode/Script/947_MostStonesRemovedWithSameRowOrColumn.js)_**
33. **_[最长的子数组按位与](./javascript/LeetCode/Script/2419_LongestSubarrayWithMaximumBitwiseAND.js)_**
34. **_[最大的数字](./javascript/LeetCode/Script/179_LargestNumber.js)_**
35. **_[字符串中的额外字符](./javascript/LeetCode/Script/2707_ExtraCharactersInAString.js)_**
36. **_[找到最长公共前缀的长度](./javascript/LeetCode/Script/3043_FindTheLengthOfTheLongestCommonPrefix.js)_**
37. **_[我的日历I](./javascript/LeetCode/Script/729_MyCalendarI.js)_**
38. **_[我的日历II](./javascript/LeetCode/Script/731_MyCalendarII.jsjs)_**
39. **_[计算最大位或子集的个数](./javascript/LeetCode/Script/2044_CountNumberOfMaximumBitwise-ORSubsets.js)_**
40. **_[将字符串拆分为唯一子字符串的最大数目](./javascript/LeetCode/Script/1593_SplitAStringIntoTheMaxNumberOfUniqueSubstrings.js)_**
41. **_[二叉树中第k大的和](./javascript/LeetCode/Script/2583_KthLargestSumInABinaryTree.js)_**

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

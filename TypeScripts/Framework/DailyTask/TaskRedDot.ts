/**
 * 每日任务红点：每个可领取的任务一个红点，入口按钮（Main/Task）自动汇总。
 *
 * 用写入桥 syncRedDotMap 从 TaskModel 推导：
 *   - 任务完成（服务器推送进度）-> 出现在结果中 -> 创建红点；
 *   - 任务领取 / 跨天重置       -> 从结果中消失 -> remove 红点，祖先自动扣减。
 * 业务代码不需要在任何地方手动 set 红点。
 */
import { RedDotSystem } from '../RedDot/RedDot'
import { RedDotPath } from '../RedDot/RedDotManager'
import { syncRedDotMap } from '../RedDot/RedDotSignal'
import { TaskModel } from './TaskModel'

/** 应用启动时调用一次，返回停止同步的函数 */
export function setupTaskRedDot(system: RedDotSystem, model: TaskModel): () => void {
    return syncRedDotMap(system, RedDotPath.TaskItem, () => new Map(model.claimableIds().map(id => [id, 1])))
}

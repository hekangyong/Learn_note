import { _decorator, Component, director } from 'cc'
import { bootstrapMvc } from './MvcRegistry'

const { ccclass } = _decorator

/** 挂在启动场景的节点上：节点常驻，并启动所有 Controller */
@ccclass('MvcBootstrap')
export class MvcBootstrap extends Component {
    onLoad() {
        director.addPersistRootNode(this.node)
        bootstrapMvc()
    }
}

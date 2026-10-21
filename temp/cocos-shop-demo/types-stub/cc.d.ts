/**
 * 仅用于在没有 Cocos 编辑器的情况下做类型检查：声明了本示例用到的 cc API。
 * 拷贝进真实 Cocos 项目时删除这个目录，改用编辑器生成的 tsconfig。
 */
declare module 'cc' {
    type Constructor<T> = abstract new (...args: any[]) => T

    export class Node {
        active: boolean
        parent: Node | null
        readonly children: readonly Node[]
        getComponent<T extends Component>(type: Constructor<T>): T | null
        destroy(): boolean
    }
    export class Component {
        readonly node: Node
        readonly enabledInHierarchy: boolean
    }
    export class Label extends Component {
        string: string
    }
    export class Button extends Component {
        interactable: boolean
    }
    export class Prefab {}
    export function instantiate(original: Prefab): Node
    export const director: { addPersistRootNode(node: Node): void }
    export const _decorator: {
        ccclass(name: string): <T extends Constructor<unknown>>(target: T) => T
        property(type: unknown): (target: object, key: string) => void
    }
}

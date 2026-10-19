/**
 * 示例二：基于装饰器 + 元数据的通用序列化器（class-transformer / NestJS 的简化原理版）
 *
 * 示例一中每个 DTO 都要手写 toJSON / fromJSON，字段一多就很繁琐且容易漏。
 * 思路：把「每个字段该怎么转换」用装饰器声明在字段上（元数据），
 *       再写一个通用的 serialize / deserialize 去读取这些元数据，统一完成转换。
 *
 * 核心原理：
 *   1. 装饰器在「类定义时」执行一次（不是在 new 的时候），
 *      旧版属性装饰器的签名是 (target, propertyKey)，
 *      其中 target 是类的原型 (prototype)，target.constructor 就是类本身。
 *   2. 我们用一个 Map<类, 字段元数据[]> 把每个字段的配置登记下来。
 *   3. serialize：遍历该类登记过的字段，按配置取值、转换、改名，生成普通对象。
 *   4. deserialize：Object.create(Class.prototype) 创建一个「带原型」的空实例，
 *      再按配置把普通对象的值转换后赋进去 —— 这样方法 (prototype 上的) 就回来了。
 *
 * 注意：需要在 tsconfig 中开启 "experimentalDecorators": true
 * 运行：npx tsc --ignoreConfig SerializeDTO/02-DecoratorDTO.ts --target es2022 --module commonjs --experimentalDecorators --outDir dist && node dist/02-DecoratorDTO.js
 */

// ------------------------------------------------------------
// 1. 元数据结构与存储
// ------------------------------------------------------------
type Constructor<T = any> = new (...args: any[]) => T

interface FieldMeta {
    property: string // 类中的属性名，如 userName
    jsonKey: string // JSON 中的键名，如 user_name
    exclude?: boolean // 是否排除（不序列化）
    type?: () => Constructor // 嵌套 DTO 的类型；用函数包一层是为了避免类还未定义（循环引用/声明顺序问题）
    toPlain?: (value: any) => any // 自定义序列化
    toClass?: (value: any) => any // 自定义反序列化
}

// key：类（构造函数）  value：该类自身声明的字段元数据
const metadataStore = new Map<Function, Map<string, FieldMeta>>()

/** 取得（或创建）某个字段的元数据，多个装饰器作用在同一字段时会合并到同一个对象上 */
function getFieldMeta(target: object, property: string): FieldMeta {
    const ctor = target.constructor
    let fields = metadataStore.get(ctor)
    if (!fields) {
        fields = new Map()
        metadataStore.set(ctor, fields)
    }
    let meta = fields.get(property)
    if (!meta) {
        meta = { property, jsonKey: property }
        fields.set(property, meta)
    }
    return meta
}

/**
 * 获取类的全部字段元数据（包含父类）。
 * 沿着原型链向上走：子类.__proto__ === 父类，从而支持 DTO 继承。
 */
function getAllFields(ctor: Function): FieldMeta[] {
    const result = new Map<string, FieldMeta>()
    const chain: Function[] = []
    for (let c = ctor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
        chain.unshift(c) // 父类在前，子类在后，子类的同名配置可以覆盖父类
    }
    for (const c of chain) {
        metadataStore.get(c)?.forEach((meta, key) => result.set(key, meta))
    }
    return [...result.values()]
}

// ------------------------------------------------------------
// 2. 装饰器（装饰器工厂：返回真正的装饰器函数）
// ------------------------------------------------------------

/** 标记字段参与序列化，可选地指定 JSON 中的键名 */
function Expose(jsonKey?: string) {
    return (target: object, property: string) => {
        const meta = getFieldMeta(target, property)
        if (jsonKey) meta.jsonKey = jsonKey
    }
}

/** 排除字段：序列化时不输出，反序列化时也不接收（防止客户端篡改如 isAdmin 之类的字段） */
function Exclude() {
    return (target: object, property: string) => {
        getFieldMeta(target, property).exclude = true
    }
}

/** 声明嵌套 DTO 的类型；数组会对每个元素分别处理 */
function Type(typeFn: () => Constructor) {
    return (target: object, property: string) => {
        getFieldMeta(target, property).type = typeFn
    }
}

/** 自定义双向转换 */
function Transform(options: { toPlain?: (v: any) => any; toClass?: (v: any) => any }) {
    return (target: object, property: string) => {
        Object.assign(getFieldMeta(target, property), options)
    }
}

/** 常用的 Date 转换，基于 Transform 组合出来 */
const DateField = () =>
    Transform({
        toPlain: (d: Date) => d.toISOString(),
        toClass: (s: string) => {
            const d = new Date(s)
            if (Number.isNaN(d.getTime())) throw new TypeError(`非法日期: ${s}`)
            return d
        },
    })

// ------------------------------------------------------------
// 3. 通用的 serialize / deserialize
// ------------------------------------------------------------

/** 类实例 -> 普通对象（plain object），之后可以安全地 JSON.stringify */
function serialize(instance: any): any {
    if (instance === null || instance === undefined) return instance
    if (Array.isArray(instance)) return instance.map(serialize)
    if (typeof instance !== 'object') return instance

    const plain: Record<string, any> = {}
    for (const meta of getAllFields(instance.constructor)) {
        if (meta.exclude) continue
        const value = instance[meta.property]
        if (value === undefined) continue

        let out: any
        if (meta.toPlain) out = meta.toPlain(value)
        else if (meta.type) out = serialize(value) // 嵌套 DTO：递归
        else out = value

        plain[meta.jsonKey] = out
    }
    return plain
}

/** 普通对象 -> 类实例 */
function deserialize<T>(ctor: Constructor<T>, plain: any): T {
    if (typeof plain !== 'object' || plain === null) {
        throw new TypeError(`期望得到 ${ctor.name} 对象，实际为 ${plain}`)
    }

    /**
     * 关键点：Object.create(ctor.prototype) 只建立原型链、不执行构造函数。
     * 好处：构造函数可以有任意参数，反序列化不受其影响；
     * 实例的 __proto__ 指向 ctor.prototype，所以 instanceof 成立、方法可调用。
     */
    const instance = Object.create(ctor.prototype)

    for (const meta of getAllFields(ctor)) {
        if (meta.exclude) continue
        const raw = plain[meta.jsonKey]
        if (raw === undefined) continue

        let value: any
        if (meta.toClass) {
            value = meta.toClass(raw)
        } else if (meta.type) {
            const Sub = meta.type()
            value = Array.isArray(raw) ? raw.map((item) => deserialize(Sub, item)) : deserialize(Sub, raw)
        } else {
            value = raw
        }
        instance[meta.property] = value
    }
    return instance
}

// ------------------------------------------------------------
// 4. 定义 DTO：只需要「声明」，不需要写转换代码
// ------------------------------------------------------------

/** 基类：所有实体共有的字段，演示继承 */
class BaseDTO {
    @Expose()
    id!: number

    @Expose('created_at')
    @DateField()
    createdAt!: Date
}

class TagDTO {
    @Expose()
    name!: string

    @Expose()
    color!: string
}

class ArticleDTO extends BaseDTO {
    @Expose()
    title!: string

    @Expose('author_name')
    authorName!: string

    @Expose()
    @Type(() => TagDTO) // 数组中的每个元素都会被还原为 TagDTO
    tags!: TagDTO[]

    @Exclude() // 内部字段，不对外暴露
    internalNote?: string

    /** 原型上的方法：反序列化后依然可以调用 */
    summary() {
        return `#${this.id} 《${this.title}》 by ${this.authorName} [${this.tags.map((t) => t.name).join(', ')}]`
    }
}

// ------------------------------------------------------------
// 5. 使用
// ------------------------------------------------------------
{
    const article = new ArticleDTO()
    article.id = 42
    article.createdAt = new Date('2024-06-01T12:00:00Z')
    article.title = 'TypeScript 序列化'
    article.authorName = 'Tom'
    article.tags = [Object.assign(new TagDTO(), { name: 'ts', color: 'blue' })]
    article.internalNote = '这是内部备注'

    // 序列化：类实例 -> plain object -> JSON 字符串
    const json = JSON.stringify(serialize(article))
    console.log('[装饰器DTO] 序列化：', json)
    // internalNote 被排除；authorName/createdAt 被改名；Date 转为 ISO 字符串；父类字段 id 也在

    // 模拟收到一个后端返回的 JSON（多了 internalNote，想偷偷注入）
    const incoming = JSON.parse(json)
    incoming.internalNote = 'hacked'

    // 反序列化：JSON -> plain object -> 类实例
    const restored = deserialize(ArticleDTO, incoming)
    console.log('[装饰器DTO] 是 ArticleDTO：', restored instanceof ArticleDTO) // true
    console.log('[装饰器DTO] 也是 BaseDTO：', restored instanceof BaseDTO) // true
    console.log('[装饰器DTO] createdAt 是 Date：', restored.createdAt instanceof Date) // true
    console.log('[装饰器DTO] tags[0] 是 TagDTO：', restored.tags[0] instanceof TagDTO) // true
    console.log('[装饰器DTO] internalNote 被忽略：', restored.internalNote) // undefined
    console.log('[装饰器DTO] 调用方法：', restored.summary())

    try {
        deserialize(ArticleDTO, { ...incoming, created_at: 'not a date' })
    } catch (e) {
        console.log('[装饰器DTO] 校验失败：', (e as Error).message)
    }
}

export {}

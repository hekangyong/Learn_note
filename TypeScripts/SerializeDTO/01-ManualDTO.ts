/**
 * 示例一：手写 DTO 的序列化 / 反序列化
 *
 * DTO (Data Transfer Object，数据传输对象)：专门用于在「系统边界」传输数据的对象，
 * 例如 前端 <-> 后端、服务 <-> 服务、内存 <-> localStorage / 数据库。
 *
 * - 序列化 (serialize)：内存中的对象  ->  可传输的格式（这里是 JSON 字符串）
 * - 反序列化 (deserialize)：JSON 字符串  ->  内存中的对象（最好是带方法的类实例）
 *
 * 为什么不能直接 JSON.stringify / JSON.parse 了事？
 *   1. JSON 只有 string / number / boolean / null / array / object 六种类型，
 *      Date、Map、Set、bigint、类实例的「原型（方法）」都会丢失或报错。
 *   2. JSON.parse 返回的是 any，TS 的类型只是「声称」，运行时并没有校验。
 *   3. 前后端字段命名常常不同（user_name vs userName），需要映射。
 *   4. 有些字段不应该被传出去（如 password）。
 *
 * 运行：npx tsc SerializeDTO/01-ManualDTO.ts --target es2022 --module commonjs --outDir dist && node dist/01-ManualDTO.js
 */

// ------------------------------------------------------------
// 1. 先看看直接用 JSON 会出什么问题
// ------------------------------------------------------------
{
    class Point {
        constructor(public x: number, public y: number) {}
        length() {
            return Math.hypot(this.x, this.y)
        }
    }

    const data = { p: new Point(3, 4), at: new Date('2024-01-01T00:00:00Z'), tags: new Set(['a']) }
    const json = JSON.stringify(data)
    console.log('[问题演示] 序列化结果：', json)
    // => {"p":{"x":3,"y":4},"at":"2024-01-01T00:00:00.000Z","tags":{}}
    //    Set 变成了 {}，Date 变成了字符串（因为 Date.prototype.toJSON 存在）

    const back = JSON.parse(json)
    console.log('[问题演示] p 是 Point 吗？', back.p instanceof Point) // false：原型丢了，没有 length()
    console.log('[问题演示] at 的类型：', typeof back.at) // string：不再是 Date
}

// ------------------------------------------------------------
// 2. 定义「线上格式」(Wire Format) —— 即 JSON 里真实长什么样
//    用 snake_case，日期用 ISO 字符串，这通常是后端接口约定
// ------------------------------------------------------------
interface AddressJSON {
    city: string
    street: string
}

interface UserJSON {
    id: number
    user_name: string
    created_at: string // ISO 日期字符串
    roles: string[] // Set 在 JSON 里只能用数组表示
    address: AddressJSON | null
}

// ------------------------------------------------------------
// 3. 定义「领域模型」(Domain Model) —— 程序内部使用的富对象
// ------------------------------------------------------------
class AddressDTO {
    constructor(public city: string, public street: string) {}

    toJSON(): AddressJSON {
        return { city: this.city, street: this.street }
    }

    static fromJSON(json: AddressJSON): AddressDTO {
        return new AddressDTO(json.city, json.street)
    }
}

class UserDTO {
    constructor(
        public id: number,
        public userName: string,
        public createdAt: Date,
        public roles: Set<string>,
        public address: AddressDTO | null,
        // 敏感字段：只在内存中存在，绝不序列化出去
        public password?: string
    ) {}

    isAdmin() {
        return this.roles.has('admin')
    }

    /**
     * 原理：JSON.stringify 在处理每个值时，会先检查它有没有 toJSON 方法，
     * 如果有，就用 toJSON() 的返回值代替原对象继续序列化。
     * （Date 能变成 ISO 字符串，正是因为 Date.prototype.toJSON 的存在）
     *
     * 所以只要实现 toJSON，JSON.stringify(user) 就会自动走我们的转换逻辑，
     * 并且嵌套对象（address）也会递归地调用它自己的 toJSON。
     */
    toJSON(): UserJSON {
        return {
            id: this.id,
            user_name: this.userName, // 字段重命名：camelCase -> snake_case
            created_at: this.createdAt.toISOString(), // Date -> string
            roles: [...this.roles], // Set -> Array
            address: this.address ? this.address.toJSON() : null,
            // password 故意不写，实现「排除字段」
        }
    }

    /**
     * 反序列化没有 toJSON 那样的「自动钩子」，必须由我们显式调用。
     * 这里同时做了「运行时校验」：JSON.parse 返回的是 unknown/any，
     * TS 类型在运行时已经被擦除，不校验的话脏数据会悄悄流入系统。
     */
    static fromJSON(raw: unknown): UserDTO {
        if (!isUserJSON(raw)) {
            throw new TypeError('非法的 User 数据：' + JSON.stringify(raw))
        }
        return new UserDTO(
            raw.id,
            raw.user_name, // snake_case -> camelCase
            new Date(raw.created_at), // string -> Date
            new Set(raw.roles), // Array -> Set
            raw.address ? AddressDTO.fromJSON(raw.address) : null // 递归还原嵌套对象
        )
    }
}

/**
 * 类型守卫 (type guard)：返回值写成 `raw is UserJSON`，
 * 校验通过后 TS 会把 raw 的类型从 unknown 收窄为 UserJSON。
 */
function isUserJSON(raw: unknown): raw is UserJSON {
    if (typeof raw !== 'object' || raw === null) return false
    const r = raw as Record<string, unknown>
    return (
        typeof r.id === 'number' &&
        typeof r.user_name === 'string' &&
        typeof r.created_at === 'string' &&
        !Number.isNaN(Date.parse(r.created_at)) &&
        Array.isArray(r.roles) &&
        r.roles.every((x) => typeof x === 'string') &&
        (r.address === null ||
            (typeof r.address === 'object' &&
                typeof (r.address as any).city === 'string' &&
                typeof (r.address as any).street === 'string'))
    )
}

// ------------------------------------------------------------
// 4. 使用
// ------------------------------------------------------------
{
    const user = new UserDTO(
        1,
        'Tom',
        new Date('2024-05-20T08:00:00Z'),
        new Set(['admin', 'editor']),
        new AddressDTO('Shanghai', 'Nanjing Rd'),
        '123456'
    )

    // 序列化：JSON.stringify 自动调用 user.toJSON()
    const json = JSON.stringify(user)
    console.log('\n[手写DTO] 序列化：', json)
    // password 不在结果里，字段名已变为 snake_case

    // 反序列化：显式调用 fromJSON
    const restored = UserDTO.fromJSON(JSON.parse(json))
    console.log('[手写DTO] 是 UserDTO 实例：', restored instanceof UserDTO) // true
    console.log('[手写DTO] createdAt 是 Date：', restored.createdAt instanceof Date) // true
    console.log('[手写DTO] 方法可用 isAdmin()：', restored.isAdmin()) // true
    console.log('[手写DTO] 嵌套对象：', restored.address instanceof AddressDTO) // true

    // 脏数据会被拦截
    try {
        UserDTO.fromJSON({ id: '1', user_name: 'x' })
    } catch (e) {
        console.log('[手写DTO] 校验失败：', (e as Error).message)
    }
}

// ------------------------------------------------------------
// 5. 补充：JSON.stringify 的 replacer 与 JSON.parse 的 reviver
//    它们是「全局」钩子，适合处理通用类型（如所有 Date / bigint），
//    但无法知道「这个对象应该还原成哪个类」，所以复杂 DTO 仍需 fromJSON。
// ------------------------------------------------------------
{
    const data = { amount: 12345678901234567890n, at: new Date('2024-01-01T00:00:00Z') }

    // replacer：每个键值对都会经过它；bigint 默认会让 stringify 直接抛错
    const json = JSON.stringify(data, (_key, value) =>
        typeof value === 'bigint' ? { __type: 'bigint', value: value.toString() } : value
    )
    console.log('\n[replacer] ', json)

    // reviver：从最内层开始、自底向上地处理每个键值对，返回值替换原值
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
    const back = JSON.parse(json, (_key, value) => {
        if (value && value.__type === 'bigint') return BigInt(value.value)
        if (typeof value === 'string' && ISO_DATE.test(value)) return new Date(value)
        return value
    })
    console.log('[reviver] amount 类型：', typeof back.amount, ' at 是 Date：', back.at instanceof Date)
}

export {}

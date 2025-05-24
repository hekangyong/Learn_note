// 定义订单可能的状态和触发事件类型
type OrderState =
    | 'Created'
    | 'PaymentPending'
    | 'Paid'
    | 'Shipped'
    | 'Delivered'
    | 'Cancelled'
type OrderEvent =
    | 'PAY'
    | 'PAY_SUCCESS'
    | 'PAY_FAILED'
    | 'SHIP'
    | 'DELIVER'
    | 'CANCEL'

type StateType = string | number
interface StateAction<S> {
    target: S
    action?: (paload?: any) => Promise<void>
}

class StateMachine<S extends StateType = any, E extends StateType = any> {
    private currentState: S
    private transition: Partial<Record<S, Partial<Record<E, StateAction<S>>>>>
    private finalStates: Set<S>

    constructor(
        initialState: S,
        transition: Partial<Record<S, Partial<Record<E, StateAction<S>>>>>,
        finalState: S[]
    ) {
        this.currentState = initialState
        this.transition = transition
        this.finalStates = new Set(finalState)
    }

    public async dispatch(event: E, paload?: any) {
        if (this.finalStates.has(this.currentState)) {
            console.warn(`当前状态${this.currentState}为最终状态`)
            return
        }
        const stateTransitions = this.transition[this.currentState]
        if (!stateTransitions || !stateTransitions[event]) {
            console.error(`事件${event}在状态${this.currentState}无效`)
            return
        }
        const transition = stateTransitions[event]
        console.log(
            `触发事件${event}，从状态${this.currentState}转移到${transition.target}`
        )
        this.currentState = transition.target
        if (transition.action) {
            await transition.action(paload)
        }
        console.log(`当前状态：${this.currentState}`)
    }

    public getState(): S {
        return this.currentState
    }
}

async function simulatePayment(orderID: number) {
    console.log(`模拟支付订单${orderID}`)
    await new Promise(resolve => setTimeout(resolve, 1000))
    const success = Math.random() > 0.5
    console.log(`订单${orderID}支付${success ? '成功' : '失败'}`)
    return success
}

let orderMachine: StateMachine<OrderEvent, OrderEvent>

const orderTransitions: Partial<
    Record<OrderState, Partial<Record<OrderEvent, StateAction<OrderState>>>>
> = {
    Created: {
        PAY: {
            target: 'PaymentPending',
            action: async payload => {
                const success = await simulatePayment(payload.orderID)
                if (success) {
                    await orderMachine.dispatch('PAY_SUCCESS', payload)
                } else {
                    await orderMachine.dispatch('PAY_FAILED', payload)
                }
            },
        },
        CANCEL: { target: 'Cancelled' },
    },
    PaymentPending: {
        PAY_SUCCESS: { target: 'Paid' },
        PAY_FAILED: { target: 'Cancelled' },
    },
    Paid: {
        SHIP: {
            target: 'Shipped',
            action: async () => {
                console.log('正在发货...')
                await new Promise(reslove => setTimeout(reslove, 500))
                console.log('发货完成')
            },
        },
        CANCEL: { target: 'Cancelled' },
    },
    Shipped: {
        DELIVER: { target: 'Delivered' },
    },
    Delivered: {},
    Cancelled: {},
}

orderMachine = new StateMachine<OrderState, OrderEvent>(
    'Created',
    orderTransitions,
    ['Delivered', 'Cancelled']
)

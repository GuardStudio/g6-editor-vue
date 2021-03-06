import { EditorBuiltInCommand, GraphCustomEvent, ItemType, guid } from '@/components/Editor'
import { checkOutAndInEdge, nextNodeCheck } from '../utils'

export default {
  name: 'DragAddEdge',
  getDefaultCfg() {
    return { edgeType: this.core.options.defaultEdge.shape || '', allowMultiEdge: true }
  },

  getEvents() {
    return {
      'node:mousedown': 'onMousedown',
      mousemove: 'onMousemove',
      mouseup: 'onMouseup'
    }
  },

  isAnchor(ev) {
    const { target } = ev
    const targetName = target.get('className')
    if (targetName == 'anchor') return true
    else return false
  },

  notSelf(ev) {
    const node = ev.item
    const model = node.getModel()
    if (this.edge.getSource().get('id') === model.id) return false
    return true
  },

  // 两个节点之间，相同方向的线条只允许连一条
  isOnlyOneEdge(node) {
    if (this.allowMultiEdge) return true
    const source = this.edge.getSource().get('id')
    const target = node.get('id')
    if (!source || !target) return true
    return !node.getEdges().some(edge => {
      const sourceId = edge.getSource().get('id')
      const targetId = edge.getTarget().get('id')
      if (sourceId === source && targetId === target) return true
      else false
    })
  },

  addEdgeCheck(ev, inFlag = undefined, exclude) {
    const { graph, isAnchor } = this
    const linkRule = graph.get('defaultEdge').linkRule
    const node = ev.item
    
    // 如果点击的不是锚点就结束
    if (!isAnchor(ev)) return false
    // 出入度检查
    return checkOutAndInEdge(node, inFlag, linkRule, exclude)
  },

  onMousedown(ev) {
    const { edgeType } = this
    if (!this.addEdgeCheck.call(this, ev, 'out')) return
    const node = ev.item
    const graph = this.graph
    this.sourceNode = node
    graph.getNodes().forEach(n => {
      // 给其他所有节点加上 addingEdge 标识，
      // 让其 anchor 激活，表示可以连入
      if (n.get('id') !== node.get('id')) {
        graph.setItemState(n, 'addingEdge', true)
      } else graph.setItemState(n, 'addingSource', true)
    })

    const point = { x: ev.x, y: ev.y }
    const model = node.getModel()
    // 点击节点，触发增加边
    if (!this.addingEdge && !this.edge) {
      const item = {
        id: guid(),
        shape: edgeType,
        source: model.id,
        target: point,
        sourceAnchor: ev.target.get('index')
      }
      this.edge = graph.addItem('edge', item)
      this.addingEdge = true
    }
  },
  onMousemove(ev) {
    const { graph } = this
    if (this.addingEdge && this.edge) {
      const point = { x: ev.x, y: ev.y }
      // 鼠标放置到一个锚点上时，更新边
      // 否则只更新线的终点位置
      if (this.addEdgeCheck.call(this, ev, 'in', [this.edge.get('model').id]) && this.notSelf(ev)) {
        const node = ev.item
        const model = node.getModel()
        graph.updateItem(this.edge, {
          targetAnchor: ev.target.get('index'),
          target: model.id
        })
      } else graph.updateItem(this.edge, { target: point })
    }
  },
  onMouseup(ev) {
    const { graph, sourceNode } = this
    const node = ev.item
    // 隐藏所有节点的锚点
    const hideAnchors = () => {
      graph.setAutoPaint(false)
      graph.getNodes().forEach(n => {
        // 清楚所有节点状态
        n.clearStates('addingEdge')
        n.clearStates('limitLink')
        n.clearStates('addingSource')
      })
      graph.refreshItem(sourceNode)
      graph.paint()
      graph.setAutoPaint(true)
    }

    const removEdge = () => {
      graph.removeItem(this.edge)
      this.edge = null
      this.addingEdge = false
    }
    if (!this.addEdgeCheck.call(this, ev, 'in', this.edge ? [this.edge.get('model').id] : [])) {
      if (this.edge && this.addingEdge) {
        removEdge()
        hideAnchors()
      }
      return
    }

    const model = node.getModel()
    if (this.addingEdge && this.edge) {
      // 禁止自己连自己
      if (!this.notSelf(ev) || !this.isOnlyOneEdge(node)) {
        removEdge()
        hideAnchors()
        return
      }
      graph.emit(GraphCustomEvent.onBeforeConnect, {
        edge: this.edge
      })
      graph.setItemState(this.edge, 'drag', false)
      graph.updateItem(this.edge, {
        targetAnchor: ev.target.get('index'),
        target: model.id
      })
      const params = {
        type: ItemType.Edge,
        model: this.edge.getModel()
      }
      graph.remove(this.edge)
      this.core.commandManager.execute(EditorBuiltInCommand.Add, params)
      graph.emit(GraphCustomEvent.onAfterConnect, {
        edge: this.edge
      })
      this.edge = null
      this.addingEdge = false
      hideAnchors()
    }
  }
}

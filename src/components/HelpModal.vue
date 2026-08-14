<script setup lang="ts">
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="help-mask" @click.self="close">
      <div class="help-modal">
        <div class="help-head">
          <h2>使用说明</h2>
          <button class="close-btn" title="关闭" @click="close">×</button>
        </div>

        <div class="help-body">
          <section>
            <h3>小贴士</h3>
            <ul>
              <li>点「开始新对局」可选择双人对战、人机对战或 AI 对弈，并配置双方模型与执子颜色。</li>
              <li>关闭「请求 AI」后，可以手动落子（包括代替 AI 落子）。</li>
              <li>AI 对弈会自动进行直到分出胜负；某方连续失败（默认重试 2 次）或无可用模型时判负并停止对局。</li>
              <li>优先使用 9×9 棋盘开始游戏，否则模型思考时间可能超过十分钟。</li>
              <li>点击棋谱中的某一手，可以回看该手时的棋局（复盘）。</li>
            </ul>
          </section>
        </div>

        <div class="help-foot">
          <button @click="close">知道了</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-mask {
  position: fixed;
  inset: 0;
  background: rgba(40, 28, 12, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.help-modal {
  background: #fffaf0;
  border: 1px solid #d8c3a0;
  border-radius: 12px;
  max-width: 560px;
  width: 100%;
  max-height: 86vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.help-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 10px;
  border-bottom: 1px solid #e7d9bf;
}

.help-head h2 {
  margin: 0;
  font-size: 18px;
  color: #4a2f14;
}

.close-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #8a7357;
  cursor: pointer;
  padding: 0 4px;
}

.help-body {
  padding: 14px 18px;
  text-align: left;
}

.help-body section {
  margin-bottom: 16px;
}

.help-body h3 {
  margin: 0 0 8px;
  font-size: 15px;
  color: #4a2f14;
}

.help-body ul {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: #4a3a22;
}

.help-foot {
  padding: 10px 18px 16px;
  text-align: right;
  border-top: 1px solid #e7d9bf;
}

.help-foot button {
  background: #fffdf8;
  border: 1px solid #b89a6a;
  border-radius: 8px;
  padding: 6px 20px;
  font-size: 14px;
  cursor: pointer;
}

.help-foot button:hover {
  background: #fdf0da;
}
</style>

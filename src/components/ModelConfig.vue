<script setup lang="ts">
import { ref, watch } from 'vue'
import { chatCompletion, fetchModels } from '../ai/client'
import type { ChatMessage } from '../ai/client'
import { randomId, useConfig } from '../store/config'
import type { ProviderConfig } from '../store/config'

const { config } = useConfig()

interface TestResult {
  ok: boolean
  message: string
  durationMs?: number
  raw?: string
}

const testing = ref<Record<string, boolean>>({})
const results = ref<Record<string, TestResult | null>>({})
const fetchingModels = ref<Record<string, boolean>>({})
const modelResult = ref<Record<string, { ok: boolean; message: string } | null>>({})

const timeoutSeconds = ref(Math.round(config.ai.timeoutMs / 1000))

watch(
  () => config.ai.timeoutMs,
  (v) => {
    timeoutSeconds.value = Math.round(v / 1000)
  },
)

function onTimeoutChange() {
  const secs = Math.max(10, Math.round(timeoutSeconds.value))
  timeoutSeconds.value = secs
  config.ai.timeoutMs = secs * 1000
}

function addProvider() {
  config.providers.push({
    id: randomId(),
    name: '新 Provider',
    baseUrl: 'https://api.example.com/v1',
    apiKey: '',
    models: [],
    enabled: true,
  })
}

function removeProvider(provider: ProviderConfig) {
  const idx = config.providers.findIndex((p) => p.id === provider.id)
  if (idx === -1) return
  config.providers.splice(idx, 1)
  if (config.active?.providerId === provider.id) config.active = null
}

function addModel(provider: ProviderConfig, input: HTMLInputElement) {
  const name = input.value.trim()
  if (name === '') return
  if (!provider.models.includes(name)) provider.models.push(name)
  input.value = ''
}

function removeModel(provider: ProviderConfig, model: string) {
  const idx = provider.models.indexOf(model)
  if (idx !== -1) provider.models.splice(idx, 1)
  if (config.active?.providerId === provider.id && config.active.model === model) {
    config.active = null
  }
}

/** 从 Base URL 拉取模型列表并合并进当前 provider（兼容中转站） */
async function fetchProviderModels(provider: ProviderConfig) {
  if (provider.baseUrl.trim() === '') {
    modelResult.value[provider.id] = { ok: false, message: '请先填写 Base URL' }
    return
  }
  fetchingModels.value[provider.id] = true
  modelResult.value[provider.id] = null
  try {
    const models = await fetchModels(provider)
    if (models.length === 0) {
      modelResult.value[provider.id] = { ok: false, message: '服务未返回模型列表，可手动添加' }
      return
    }
    const existing = new Set(provider.models)
    let added = 0
    for (const m of models) {
      if (!existing.has(m)) {
        provider.models.push(m)
        added += 1
      }
    }
    modelResult.value[provider.id] = {
      ok: true,
      message: '获取到 ' + models.length + ' 个模型' + (added > 0 ? '，新增 ' + added + ' 个' : ''),
    }
  } catch (err) {
    modelResult.value[provider.id] = { ok: false, message: (err as Error).message }
  } finally {
    fetchingModels.value[provider.id] = false
  }
}

function resetAiParams() {
  config.ai.temperature = 0.7
  config.ai.maxTokens = 300000
  config.ai.timeoutMs = 3000000
  config.ai.maxAutoRetries = 2
  config.ai.thinkingLevel = 'high'
  config.ai.extraPrompt = ''
}

async function testProvider(provider: ProviderConfig) {
  if (provider.models.length === 0) {
    results.value[provider.id] = { ok: false, message: '请先添加至少一个模型' }
    return
  }
  testing.value[provider.id] = true
  results.value[provider.id] = null
  const start = Date.now()
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是测试助手，请只回复：pong' },
      { role: 'user', content: 'ping' },
    ]
    const chat = await chatCompletion(provider, provider.models[0], messages, {
      temperature: 0.7,
      maxTokens: 32,
      timeoutMs: 30000,
      thinkingLevel: config.ai.thinkingLevel,
    })
    results.value[provider.id] = {
      ok: true,
      message: chat.content,
      durationMs: Date.now() - start,
      raw: chat.reasoning,
    }
  } catch (err) {
    results.value[provider.id] = {
      ok: false,
      message: (err as Error).message,
      durationMs: Date.now() - start,
    }
  } finally {
    testing.value[provider.id] = false
  }
}
</script>

<template>
  <div class="model-config">
    <div class="config-head">
      <h2>模型配置</h2>
      <button @click="addProvider">+ 添加 Provider</button>
    </div>

    <p class="hint">
      apiKey 仅保存在浏览器 localStorage，请勿在公共电脑使用；后续可改为后端代理存储。
      中转站/服务商一般提供 GET /models 接口，可点「从 Base URL 获取模型」自动拉取模型列表。
    </p>

    <div v-for="p in config.providers" :key="p.id" class="provider-card">
      <div class="provider-row">
        <input v-model="p.name" class="input name" placeholder="名称（如 DeepSeek）" />
        <label class="check">
          <input v-model="p.enabled" type="checkbox" /> 启用
        </label>
        <button class="danger" @click="removeProvider(p)">删除</button>
      </div>

      <div class="provider-row">
        <input v-model="p.baseUrl" class="input grow" placeholder="Base URL：/deepseek（本地代理）或 https://api.deepseek.com" />
      </div>

      <div class="provider-row">
        <input v-model="p.apiKey" class="input grow" type="password" placeholder="API Key" autocomplete="off" />
      </div>

      <div class="provider-row models">
        <div class="model-chips">
          <span v-for="m in p.models" :key="m" class="chip">
            {{ m }}
            <button class="chip-x" title="移除模型" @click="removeModel(p, m)">×</button>
          </span>
          <input
            class="input model-input"
            placeholder="添加模型名后回车"
            @keydown.enter.prevent="addModel(p, $event.target as HTMLInputElement)"
          />
        </div>
      </div>

      <div class="provider-row actions">
        <button :disabled="fetchingModels[p.id]" @click="fetchProviderModels(p)">
          {{ fetchingModels[p.id] ? '获取中…' : '从 Base URL 获取模型' }}
        </button>
        <span v-if="modelResult[p.id]" class="test-result" :class="modelResult[p.id]!.ok ? 'ok' : 'fail'">
          {{ modelResult[p.id]!.ok ? '✓' : '✗' }} {{ modelResult[p.id]!.message }}
        </span>
        <button :disabled="testing[p.id]" @click="testProvider(p)">
          {{ testing[p.id] ? '测试中…' : '发送测试消息' }}
        </button>
        <span v-if="results[p.id]" class="test-result" :class="results[p.id]!.ok ? 'ok' : 'fail'">
          {{ results[p.id]!.ok ? '✓' : '✗' }} {{ results[p.id]!.message }}
          <template v-if="results[p.id]!.ok">（{{ results[p.id]!.durationMs }}ms）</template>
        </span>
      </div>
    </div>

    <div v-if="false" class="provider-card">
      <div class="config-head">
        <h2>AI 行为参数（全局）</h2>
      </div>
      <div class="provider-row params">
        <label>
          temperature
          <input v-model.number="config.ai.temperature" class="input num" type="number" min="0" max="2" step="0.1" />
        </label>
        <label>
          max_tokens
          <input v-model.number="config.ai.maxTokens" class="input num" type="number" min="64" max="300000" step="64" />
        </label>
        <button class="small" @click="resetAiParams">恢复默认</button>
        <label>
          自动重试次数
          <input v-model.number="config.ai.maxAutoRetries" class="input num" type="number" min="0" max="5" />
        </label>
        <label>
          超时（秒）
          <input v-model.number="timeoutSeconds" class="input num" type="number" min="10" max="10000" @change="onTimeoutChange" />
        </label>
      </div>
      <div class="provider-row">
        <label>
          默认思考强度
          <select v-model="config.ai.thinkingLevel" class="input">
            <option value="none">none（关闭思考）</option>
            <option value="low">low</option>
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </label>
      </div>
      <div class="provider-row">
        <input v-model="config.ai.extraPrompt" class="input grow" placeholder="附加自定义提示（可选）" />
      </div>
      <p class="hint">
        提示：DeepSeek 等推理模型的思考过程会占用 max_tokens，且局势越复杂耗时越长。默认 max_tokens=300000、超时=3000 秒，可在上方调整；若出现「模型返回内容为空」，请关闭「允许思考」或增大 max_tokens。
      </p>
    </div>

    <p v-if="config.providers.length === 0" class="hint">暂无 Provider，点击上方按钮添加。</p>
  </div>
</template>

<style scoped>
.model-config {
  max-width: 720px;
  margin: 0 auto 24px;
  text-align: left;
  border: 1px solid #d8c3a0;
  border-radius: 10px;
  background: #fffaf0;
  padding: 14px 18px;
}

.config-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.config-head h2 {
  margin: 0;
  font-size: 16px;
  color: #4a2f14;
}

.hint {
  font-size: 12px;
  color: #8a7357;
  margin: 4px 0 12px;
}

.provider-card {
  border: 1px solid #e2d3b8;
  border-radius: 8px;
  background: #fffdf6;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.provider-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.provider-row:last-child {
  margin-bottom: 0;
}

.input {
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #cbb48a;
  background: #fff;
}

.input.name {
  width: 160px;
}

.input.grow {
  flex: 1;
}

.model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex: 1;
}

.chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  background: #efe2c8;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  color: #4a2f14;
}

.chip-x {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  color: #8a5a20;
}

.model-input {
  width: 170px;
}

.check {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
}

.danger {
  background: #fff0f0;
  color: #c62828;
  border-color: #e0b4b4;
}

.actions {
  flex-wrap: wrap;
}

.provider-row.params {
  flex-wrap: wrap;
}

.provider-row.params label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

.input.num {
  width: 90px;
}

button.small {
  font-size: 12px;
  padding: 4px 10px;
}

.test-result {
  font-size: 13px;
  word-break: break-all;
  max-width: 460px;
}

.test-result.ok {
  color: #2e7d32;
}

.test-result.fail {
  color: #c62828;
}
</style>

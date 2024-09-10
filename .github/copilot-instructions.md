# VS Code 扩展：yongutils AI 编程指令

## 项目架构

这是一个混合型 VS Code 扩展，结合了 Node.js 后端逻辑和 Vue.js 前端网页视图。该扩展通过 VS Code 命令和专用的活动栏面板为开发者提供实用工具。

### 核心架构
- **扩展后端** (`src/extension.ts`): Node.js/TypeScript 处理 VS Code API、文件操作和 AI 服务
- **前端网页视图** (`src/view/`): 嵌入在 VS Code 中的 Vue 3 + TypeScript + Vite SPA
- **构建系统**: 扩展和网页视图分别使用 webpack 配置
- **通信方式**: 通过 `window.acquireVsCodeApi()` 和 VS Code 网页视图 API 进行消息传递

### 关键组件

#### 扩展层
- 主入口点: `src/extension.ts` (558 行 - 包含所有核心逻辑)
- AST 解析器: `src/ast-parser.ts` (Vue/HTML/JS 解析工具)
- 在 `package.json` 中注册命令，集成右键菜单
- 通过阿里云 Dashscope API 集成 OpenAI 进行翻译服务

#### 前端层  
- Vue 3 使用 `<script setup>` 语法和 TypeScript
- Naive UI 组件库，保持一致的暗色主题
- 通过 Layout 组件进行工具路由，动态加载组件
- 每个工具都是 `src/view/src/view/` 中的独立 Vue 组件

#### 可用工具
- JSON 序列化/格式化，支持树形/列表视图切换
- Base64/MD5 编码工具  
- JavaScript 转 TypeScript 转换
- 正则表达式测试
- 使用 Jimp 进行图片自动调整
- Vue/HTML/JS 文件的 AST 预览
- AI 驱动的翻译服务，带缓存功能

## 开发工作流

### 构建命令
```bash
# 扩展开发
pnpm run watch          # 扩展的监视模式 (webpack)
pnpm run compile        # 构建生产版本扩展
pnpm run package        # 打包扩展 vsix

# 测试  
pnpm run pretest        # 运行代码检查 + 编译 + 测试
pnpm run test           # 执行 VS Code 扩展测试
pnpm run watch-tests    # 测试的监视模式编译

# 前端 (在 src/view/ 中)
cd src/view && pnpm install  # 安装 Vue 依赖
cd src/view && pnpm run dev  # 开发服务器，端口 3000
```

### 关键开发模式

#### 扩展命令
所有命令都遵循 `yongutils.<action>` 模式，集成右键菜单。示例：
```typescript
commands.registerCommand('yongutils.translate', async () => {
  // 使用 OpenAI API 的翻译逻辑
})
```

#### 网页视图通信
```typescript
// 扩展到网页视图
webview.webview.postMessage({ type: 'command', command: 'translate' })

// 网页视图到扩展  
const vscode = acquireVsCodeApi()
vscode.postMessage({ type: 'result', data: translatedText })
```

#### 工具组件模式
每个工具组件都遵循此结构：
```vue
<template>
  <div class="flex flex-col h-full">
    <n-input v-model:value="inputValue" />
    <div class="mt-2">
      <!-- 工具特定 UI -->
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ /* props */ }>()
const emit = defineEmits(['tool-change'])
// 工具逻辑
</script>
```

## 项目约定

### 文件结构
- 扩展逻辑: `src/*.ts` (扁平结构，无子目录)
- 前端: `src/view/src/` 包含 Vue 组件
- 资源: `icons/` 用于生成的图片，`media/` 用于静态资源
- 构建输出: `dist/` (扩展) 和 `dist/view/` (网页视图)

### 依赖项
- **扩展**: `@babel/parser`, `@babel/traverse`, `@vue/compiler-sfc`, `openai`, `jimp`
- **前端**: Vue 3, Naive UI, Element Plus (部分组件)
- **构建**: Webpack (扩展), Vite (前端), TypeScript

### 配置
- 双重 TypeScript 配置: 根目录用于扩展，`src/view/` 用于前端
- Webpack 配置针对 Node.js，Vite 配置构建网页视图
- ESLint 启用 TypeScript 严格模式

### API 集成
- 翻译使用通过阿里云 Dashscope 的 OpenAI 兼容 API
- 使用 Jimp 库进行图像处理
- 使用 Babel 和 parse5 进行 AST 解析
- 翻译结果缓存系统在 `translationCache.json`

## 重要说明

- 扩展使用硬编码的 API 密钥 - 生产环境应外部化
- 网页视图在隔离上下文中运行，具有安全消息传递
- 所有文件操作都尊重 VS Code 工作区根目录或回退到桌面
- 图像生成输出到工作区根目录的 `icons/` 目录
- 扩展在所有事件上激活 (`"*"` 在 activationEvents 中)

## 调试

- 使用 VS Code 内置调试器进行扩展调试
- 通过 Chrome DevTools (网页视图上下文) 进行前端调试
- `src/test/` 中的测试文件使用 VS Code 测试运行器
- 检查 `dist/` 目录获取构建产物
